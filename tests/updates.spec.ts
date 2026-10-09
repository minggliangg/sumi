import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

// Serve the actual Pages build with a versioned worker, so these tests exercise
// browser installation, waiting, activation, and multiple app windows.
async function updateServer() {
  const worker = await readFile('dist/sw.js', 'utf8')
  let version = 1
  let allowActivation = true
  const server = createServer(async (request, response) => {
    if (request.url === '/sumi/sw.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' })
      response.end(`${allowActivation ? worker : worker.replace('"SKIP_WAITING"', '"TEST_IGNORE_SKIP_WAITING"')}\n// test version ${version}`)
      return
    }
    try {
      const upstream = await fetch(`http://127.0.0.1:4173${request.url}`)
      response.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream' })
      response.end(Buffer.from(await upstream.arrayBuffer()))
    } catch {
      response.writeHead(502)
      response.end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing update server address')
  return {
    url: `http://127.0.0.1:${address.port}/sumi/`,
    next(stall = false) { version++; allowActivation = !stall },
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  }
}

async function openApp(page: Page, url: string) {
  page.on('dialog', (dialog) => dialog.accept())
  await page.addInitScript(() => {
    sessionStorage.setItem('test-load-count', String(Number(sessionStorage.getItem('test-load-count') ?? '0') + 1))
  })
  await page.goto(url)
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  // The generated prompt-mode worker does not claim an initially open page.
  if (!await page.evaluate(() => !!navigator.serviceWorker.controller)) await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await expect(page.getByRole('button', { name: 'Update available' })).toHaveCount(0)
}

async function installUpdate(page: Page) {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    await registration.update()
  })
  await expect(page.getByRole('button', { name: 'Update available' })).toBeVisible()
}

async function loadCount(page: Page) {
  return page.evaluate(() => Number(sessionStorage.getItem('test-load-count')))
}

async function acceptUpdate(page: Page) {
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: 'Update available' }).click(),
  ])
}

test('approved update restores this workspace and leaves other windows intact', async ({ browser }) => {
  const server = await updateServer()
  const context = await browser.newContext({ viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true })
  try {
    const first = await context.newPage()
    await openApp(first, server.url)
    const firstLoads = await loadCount(first)
    await first.getByRole('textbox', { name: 'Text editor' }).fill('text in an inactive tab')
    await first.getByRole('button', { name: 'New tab', exact: true }).tap()
    await first.getByRole('textbox', { name: 'Text editor' }).fill('active document')
    const other = await context.newPage()
    await openApp(other, server.url)
    const otherLoads = await loadCount(other)
    await other.getByRole('textbox', { name: 'Text editor' }).fill('keep this other window')
    await other.getByRole('button', { name: 'Choose language', exact: true }).click()
    await other.getByRole('dialog', { name: 'Language', exact: true }).getByRole('button', { name: 'Python', exact: true }).click()
    await expect(other.getByRole('button', { name: 'Choose language', exact: true })).toHaveAttribute('data-language-status', 'ready')
    server.next()
    await installUpdate(first)
    await expect(other.getByRole('button', { name: 'Update available' })).toBeVisible()
    expect(await loadCount(first)).toBe(firstLoads)
    expect(await loadCount(other)).toBe(otherLoads)
    await first.bringToFront()
    await first.screenshot({ path: 'test-results/update-available-tablet.png' })
    await acceptUpdate(first)
    expect(await loadCount(first)).toBe(firstLoads + 1)
    await expect(first.getByRole('tab')).toHaveCount(2)
    await expect(first.getByRole('textbox', { name: 'Text editor' })).toHaveText('active document')
    await first.getByRole('tab', { name: 'text in an inactive tab', exact: true }).tap()
    await expect(first.getByRole('textbox', { name: 'Text editor' })).toHaveText('text in an inactive tab')
    await expect(first.getByRole('button', { name: 'Update available' })).toHaveCount(0)
    expect(await loadCount(other)).toBe(otherLoads)
    await expect(other.getByRole('textbox', { name: 'Text editor' })).toHaveText('keep this other window')
    server.next()
    await installUpdate(other)
    await other.bringToFront()
    await acceptUpdate(other)
    expect(await loadCount(other)).toBe(otherLoads + 1)
    await expect(other.getByRole('textbox', { name: 'Text editor' })).toHaveText('keep this other window')
    await expect(other.getByRole('button', { name: 'Choose language', exact: true })).toHaveAttribute('data-language-mode', 'python')
    expect(await other.evaluate(async () => (await navigator.serviceWorker.ready).waiting)).toBeNull()
    expect(await loadCount(first)).toBe(firstLoads + 1)
  } finally {
    await context.close()
    await server.close()
  }
})

test('foreground checking discovers an update and reloads without a discard prompt', async ({ browser }) => {
  const server = await updateServer()
  const context = await browser.newContext({ viewport: { width: 360, height: 740 } })
  try {
    const page = await context.newPage()
    await openApp(page, server.url)
    const initialLoads = await loadCount(page)
    server.next()
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByRole('button', { name: 'Update available' })).toBeVisible()
    await page.screenshot({ path: 'test-results/update-available-narrow.png' })
    page.removeAllListeners('dialog')
    const dialogs: string[] = []
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.type())
      await dialog.dismiss()
    })
    await acceptUpdate(page)
    expect(await loadCount(page)).toBe(initialLoads + 1)
    expect(dialogs).toEqual([])
    await expect(page.getByRole('textbox')).toBeFocused()
  } finally {
    await context.close()
    await server.close()
  }
})

test('stalled activation restores editing and requires fresh approval', async ({ browser }) => {
  const server = await updateServer()
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await openApp(page, server.url)
    const initialLoads = await loadCount(page)
    await page.getByRole('textbox').fill('preserve until update finishes')
    await expect(page.locator('[data-storage-status]')).toHaveAttribute('data-storage-status', 'saved')
    server.next(true)
    await installUpdate(page)
    await page.clock.install()
    await page.getByRole('button', { name: 'Update available' }).click()
    await expect(page.getByRole('button', { name: 'Updating…' })).toBeDisabled()
    await expect(page.locator('.app')).toHaveAttribute('inert', '')
    await page.clock.fastForward(15001)
    await expect(page.locator('.status')).toContainText('Please try again')
    await expect(page.locator('.app')).not.toHaveAttribute('inert', '')
    await expect(page.getByRole('textbox')).toHaveText('preserve until update finishes')
    // Activation arriving after timeout must not trigger a late reload.
    server.next()
    await installUpdate(page)
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
    })
    await expect.poll(() => page.evaluate(async () => !(await navigator.serviceWorker.ready).waiting)).toBe(true)
    expect(await loadCount(page)).toBe(initialLoads)
    await expect(page.getByRole('textbox')).toHaveText('preserve until update finishes')
    expect(await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    })).toBe(false)
  } finally {
    await context.close()
    await server.close()
  }
})

test('update storage failure preserves text and a later retry restores the saved workspace', async ({ browser }) => {
  const server = await updateServer()
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await openApp(page, server.url)
    await expect(page.locator('[data-storage-status]')).toHaveAttribute('data-storage-status', 'saved')
    const initialLoads = await loadCount(page)
    server.next()
    await installUpdate(page)
    await page.evaluate(() => {
      const original = IDBDatabase.prototype.transaction
      Object.defineProperty(window, '__restoreTransactions', { value: () => { IDBDatabase.prototype.transaction = original }, configurable: true })
      IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
        if (args[1] === 'readwrite') throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
        return original.apply(this, args)
      }
    })
    await page.getByRole('textbox', { name: 'Text editor' }).fill('preserve on update failure')
    await page.getByRole('button', { name: 'Update available', exact: true }).click()
    await expect(page.locator('[data-storage-status]')).toHaveAttribute('data-storage-status', 'error')
    await expect(page.locator('.app')).not.toHaveAttribute('inert', '')
    await expect(page.getByRole('textbox', { name: 'Text editor' })).toHaveText('preserve on update failure')
    expect(await loadCount(page)).toBe(initialLoads)
    await page.evaluate(() => (window as unknown as { __restoreTransactions(): void }).__restoreTransactions())
    await page.getByRole('button', { name: 'Retry saving', exact: true }).click()
    await expect(page.locator('[data-storage-status]')).toHaveAttribute('data-storage-status', 'saved')
    await acceptUpdate(page)
    expect(await loadCount(page)).toBe(initialLoads + 1)
    await expect(page.getByRole('textbox', { name: 'Text editor' })).toHaveText('preserve on update failure')
  } finally {
    await context.close()
    await server.close()
  }
})
