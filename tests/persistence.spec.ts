import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const editor = (page: Page) => page.getByRole('textbox', { name: 'Text editor' })
const storage = (page: Page) => page.locator('[data-storage-status]')
async function saved(page: Page) {
  await expect(storage(page)).toHaveAttribute('data-storage-status', 'saved')
}
async function choose(page: Page, name: string) {
  await page.getByRole('button', { name: 'Choose language', exact: true }).click()
  await page.getByRole('dialog', { name: 'Language', exact: true }).getByRole('button', { name, exact: true }).click()
  await expect(page.getByRole('button', { name: 'Choose language', exact: true })).toHaveAttribute('data-language-status', /^(ready|plain)$/)
}
async function openClosed(page: Page) {
  await page.getByRole('button', { name: 'Recently closed', exact: true }).click()
  return page.getByRole('dialog', { name: 'Recently closed', exact: true })
}
function formatterEntry() {
  const report = JSON.parse(readFileSync('dist/language-bundle-report.json', 'utf8')) as { formatterPacks: Record<string, { entryFile: string }> }
  return report.formatterPacks.worker.entryFile
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', dialog => dialog.accept())
  await page.goto('./')
  await saved(page)
})

test('reload restores tab order, active document and manual language without undo history', async ({ page }) => {
  await editor(page).fill('first document')
  await choose(page, 'Plain text')
  await page.getByRole('button', { name: 'New tab', exact: true }).click()
  await editor(page).fill('def second():\n    return 42')
  await choose(page, 'Python')
  await saved(page)
  await page.reload()
  await saved(page)
  await expect(page.getByRole('tab').nth(0)).toHaveText('first document')
  await expect(page.getByRole('tab').nth(1)).toContainText('def second():')
  await expect(page.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(editor(page)).toHaveText('def second():\n    return 42')
  await expect(page.getByRole('button', { name: 'Choose language', exact: true })).toHaveAttribute('data-language-mode', 'python')
  await editor(page).focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(editor(page)).toHaveText('def second():\n    return 42')
  await page.getByRole('tab').first().click()
  await expect(editor(page)).toHaveText('first document')
  await expect(page.getByRole('button', { name: 'Choose language', exact: true })).toHaveAttribute('data-language-mode', 'plain')
})

test('empty draft metadata warns before it can be lost', async ({ page }) => {
  await page.clock.install()
  const untitled = page.getByRole('tab', { name: 'untitled', exact: true })
  page.removeAllListeners('dialog')
  page.once('dialog', dialog => dialog.accept('empty named draft'))
  await untitled.press('F2')
  await expect(page.getByRole('tab', { name: 'empty named draft', exact: true })).toBeVisible()
  await choose(page, 'Python')

  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })).toBe(true)

  await page.getByRole('button', { name: 'Close empty named draft', exact: true }).click()
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })).toBe(true)
})

test('selection and settled scroll recover after reload', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 600 })
  await page.evaluate(() => document.fonts.ready)
  await editor(page).fill(Array.from({ length: 120 }, (_, i) => `line ${i + 1}`).join('\n'))
  await choose(page, 'Plain text')
  await editor(page).focus()
  await expect(editor(page)).toBeFocused()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.locator('.status')).toContainText('3 selected')
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const scroller = page.locator('.cm-scroller')
  await scroller.evaluate(el => { el.scrollTop = 500 })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const top = await scroller.evaluate(el => Math.round(el.scrollTop))
  await saved(page)
  await page.reload()
  await saved(page)
  await expect(page.locator('.status')).toContainText('3 selected')
  await expect.poll(() => scroller.evaluate(el => Math.round(el.scrollTop))).toBe(top)
})

test('recently closed text recovers across reload and permanent deletion persists', async ({ page }) => {
  await editor(page).fill('recover this document')
  await choose(page, 'Plain text')
  await page.getByRole('button', { name: 'Close recover this document', exact: true }).click()
  await saved(page)
  await page.reload()
  await saved(page)
  let dialog = await openClosed(page)
  await dialog.getByRole('button', { name: 'Restore recover this document', exact: true }).click()
  await expect(editor(page)).toHaveText('recover this document')
  await expect(page.getByRole('button', { name: 'Choose language', exact: true })).toHaveAttribute('data-language-mode', 'plain')
  await page.getByRole('button', { name: 'Close recover this document', exact: true }).click()
  dialog = await openClosed(page)
  page.removeAllListeners('dialog')
  page.once('dialog', dialog => dialog.dismiss())
  await dialog.getByRole('button', { name: 'Delete recover this document', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Restore recover this document', exact: true })).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await dialog.getByRole('button', { name: 'Delete recover this document', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Restore recover this document', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await saved(page)
  await page.reload()
  await saved(page)
  dialog = await openClosed(page)
  await expect(dialog).not.toContainText('recover this document')
})

test('empty tabs are not retained and closed documents are bounded to the newest twenty', async ({ page }) => {
  await page.getByRole('button', { name: 'Close untitled', exact: true }).click()
  let dialog = await openClosed(page)
  await expect(dialog.getByRole('button', { name: /^Restore / })).toHaveCount(0)
  await page.keyboard.press('Escape')
  for (let i = 0; i < 22; i++) {
    await editor(page).fill(`closed document ${i}`)
    await page.getByRole('button', { name: `Close closed document ${i}`, exact: true }).click()
  }
  dialog = await openClosed(page)
  await expect(dialog.getByRole('button', { name: /^Restore / })).toHaveCount(20)
  await expect(dialog.getByRole('button', { name: 'Restore closed document 0', exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Restore closed document 1', exact: true })).toHaveCount(0)
  await expect(dialog).toContainText('closed document 21')
})

test('import copies a named file, detects its extension and export downloads matching text', async ({ page }) => {
  const source = 'print("hello")\n'
  await page.locator('input[type=file]').setInputFiles({ name: 'hello.py', mimeType: 'text/plain', buffer: Buffer.from(source) })
  await expect(page.getByRole('tab', { name: 'hello.py', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(editor(page)).toHaveText('print("hello")')
  await expect(page.getByRole('button', { name: 'Choose language', exact: true })).toHaveAttribute('data-language', 'python')
  await choose(page, 'Plain text')
  await saved(page)
  await page.reload()
  await saved(page)
  await expect(page.getByRole('tab', { name: 'hello.py', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: 'Choose language', exact: true })).toHaveAttribute('data-language-mode', 'plain')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export file', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('hello.py')
  const stream = await download.createReadStream()
  expect(stream).not.toBeNull()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  expect(Buffer.concat(chunks).toString('utf8')).toBe(source)
})

test('formatting an inactive tab saves the result without another tab change', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const page = await context.newPage()
  page.on('dialog', dialog => dialog.accept())
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await context.route(`**/${formatterEntry()}`, async route => { await gate; await route.continue() })
  try {
    await page.goto('./')
    await saved(page)
    await editor(page).fill('const answer={value:42};')
    await choose(page, 'JavaScript')
    await page.getByRole('button', { name: 'Format document', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Format document', exact: true })).toHaveAttribute('data-format-status', 'formatting')

    await page.getByRole('button', { name: 'New tab', exact: true }).click()
    await editor(page).fill('keep this second document')
    await saved(page)

    release()
    const storedFirstDocument = async () => page.evaluate(() => new Promise<string | undefined>((resolve, reject) => {
      const request = indexedDB.open('sumi:workspaces', 2)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        const read = database.transaction('texts', 'readonly').objectStore('texts').getAll()
        read.onerror = () => { database.close(); reject(read.error) }
        read.onsuccess = () => {
          const rows = read.result as { text: string }[]
          database.close()
          resolve(rows.find(row => row.text.startsWith('const answer'))?.text)
        }
      }
    }))
    await expect.poll(storedFirstDocument, { timeout: 20000 }).toBe('const answer = { value: 42 };\n')

    await page.reload()
    await saved(page)
    await page.getByRole('tab').first().click()
    await expect(editor(page)).toHaveText('const answer = { value: 42 };')
  } finally {
    release()
    await context.close()
  }
})

test('separate windows keep separate workspaces and both recover after reload', async ({ page, context }) => {
  await editor(page).fill('first window')
  await saved(page)
  const other = await context.newPage()
  other.on('dialog', dialog => dialog.accept())
  await other.goto('./')
  await saved(other)
  await expect(editor(other)).toHaveText('')
  await editor(other).fill('second window')
  await saved(other)
  await page.reload()
  await other.reload()
  await saved(page)
  await saved(other)
  await expect(editor(page)).toHaveText('first window')
  await expect(editor(other)).toHaveText('second window')
})

test('failed writes keep editing in memory and retry saves the current document', async ({ page }) => {
  await editor(page).fill('last saved version')
  await saved(page)
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction
    Object.defineProperty(window, '__restoreTransactions', { value: () => { IDBDatabase.prototype.transaction = original }, configurable: true })
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      if (args[1] === 'readwrite') throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
      return original.apply(this, args)
    }
  })
  await editor(page).fill('new unsaved writing')
  await expect(storage(page)).toHaveAttribute('data-storage-status', 'error')
  await expect(editor(page)).toHaveText('new unsaved writing')
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })).toBe(true)
  await page.evaluate(() => (window as unknown as { __restoreTransactions(): void }).__restoreTransactions())
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click()
  await saved(page)
  await page.reload()
  await saved(page)
  await expect(editor(page)).toHaveText('new unsaved writing')
})

test('failed reads do not overwrite stored text and retry restores it', async ({ page }) => {
  await editor(page).fill('saved original document')
  await saved(page)
  await page.addInitScript(() => {
    const original = IDBDatabase.prototype.transaction
    Object.defineProperty(window, '__restoreTransactions', { value: () => { IDBDatabase.prototype.transaction = original }, configurable: true })
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      if (args[1] === 'readonly') throw new DOMException('Storage unavailable', 'UnknownError')
      return original.apply(this, args)
    }
  })
  await page.reload()
  await expect(storage(page)).toHaveAttribute('data-storage-status', 'error')
  await page.evaluate(() => (window as unknown as { __restoreTransactions(): void }).__restoreTransactions())
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click()
  await saved(page)
  await expect(editor(page)).toHaveText('saved original document')
})

test('toolbar icons render without relying on Nerd Font glyphs', async ({ page }) => {
  for (const name of ['New tab', 'Open file', 'Export file', 'Recently closed', 'Toggle tab layout', 'Keyboard shortcuts']) {
    const button = page.getByRole('button', { name, exact: true })
    await expect(button.locator('svg')).toBeVisible()
    await expect(button.locator('svg')).toHaveAttribute('aria-hidden', 'true')
  }
  await page.screenshot({ path: 'test-results/persistence-toolbar-desktop.png' })
  await page.getByRole('button', { name: 'Toggle tab layout', exact: true }).click()
  await page.screenshot({ path: 'test-results/persistence-toolbar-vertical-desktop.png' })
  await page.setViewportSize({ width: 360, height: 740 })
  const editorBounds = await page.locator('.editor').boundingBox()
  const statusBounds = await page.locator('.status').boundingBox()
  expect(statusBounds!.x).toBeGreaterThanOrEqual(editorBounds!.x)
  await page.screenshot({ path: 'test-results/persistence-toolbar-vertical-narrow.png' })
  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Use horizontal tabs', exact: true }).click()
  await page.screenshot({ path: 'test-results/persistence-toolbar-narrow.png' })
  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Recently closed', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Recently closed', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/recently-closed-narrow.png' })
})

test('startup retry preserves locally closed writing alongside recovered drafts', async ({ page }) => {
  await editor(page).fill('previously saved draft')
  await saved(page)
  await page.addInitScript(() => {
    const original = IDBDatabase.prototype.transaction
    Object.defineProperty(window, '__restoreTransactions', { value: () => { IDBDatabase.prototype.transaction = original }, configurable: true })
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase['transaction']>) {
      if (args[1] === 'readonly') throw new DOMException('Storage unavailable', 'UnknownError')
      return original.apply(this, args)
    }
  })
  await page.reload()
  await expect(storage(page)).toHaveAttribute('data-storage-status', 'error')
  await editor(page).fill('writing while storage failed')
  await page.getByRole('button', { name: 'Close writing while storage failed', exact: true }).click()
  await page.evaluate(() => (window as unknown as { __restoreTransactions(): void }).__restoreTransactions())
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click()
  await saved(page)
  await expect(editor(page)).toHaveText('previously saved draft')
  const dialog = await openClosed(page)
  await expect(dialog.getByRole('button', { name: 'Restore writing while storage failed', exact: true })).toBeVisible()
})

test('invalid UTF-8 import leaves existing writing intact', async ({ page }) => {
  await editor(page).fill('keep existing writing')
  await page.locator('input[type=file]').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from([0xc3, 0x28]) })
  await expect(page.getByRole('tab')).toHaveCount(1)
  await expect(editor(page)).toHaveText('keep existing writing')
  await expect(page.locator('[role=status]')).toContainText(/UTF-8|encoding|text/i)
})

test('optional draft names cancel safely, persist, export with an extension and can reset', async ({ page }) => {
  await editor(page).fill('def greet():\n    return 42')
  await choose(page, 'Python')
  const original = page.getByRole('tab').first()
  page.removeAllListeners('dialog')
  page.once('dialog', async dialog => {
    expect(dialog.type()).toBe('prompt')
    await dialog.dismiss()
  })
  await original.dblclick()
  await expect(original).toHaveText('def greet():')
  page.once('dialog', dialog => dialog.accept('My draft'))
  await original.focus()
  await original.press('F2')
  await expect(page.getByRole('tab', { name: 'My draft', exact: true })).toHaveAttribute('aria-selected', 'true')
  await saved(page)
  await page.reload()
  await saved(page)
  const named = page.getByRole('tab', { name: 'My draft', exact: true })
  await expect(named).toHaveAttribute('aria-selected', 'true')
  await expect(editor(page)).toHaveText('def greet():\n    return 42')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export file', exact: true }).click()
  expect((await downloadPromise).suggestedFilename()).toBe('My draft.py')
  page.once('dialog', dialog => dialog.accept(''))
  await named.focus()
  await named.press('F2')
  await expect(page.getByRole('tab').first()).toHaveText('def greet():')
  await saved(page)
  await page.reload()
  await saved(page)
  await expect(page.getByRole('tab').first()).toHaveText('def greet():')
})
