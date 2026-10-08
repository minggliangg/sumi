import { expect, test, type Page } from '@playwright/test'

async function write(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Text editor' }).focus()
  await page.keyboard.insertText(text)
}

async function unloadIsPrevented(page: Page) {
  return page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept())
  await page.goto('./')
})

test('cancelling a close keeps the document and its active tab', async ({ page }) => {
  await write(page, 'keep this document')
  page.removeAllListeners('dialog')
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm')
    await dialog.dismiss()
  })
  await page.getByRole('button', { name: 'Close keep this document', exact: true }).click()
  await expect(page.getByRole('tab')).toHaveText('keep this document')
  await expect(page.getByRole('textbox')).toHaveText('keep this document')
})

test('Pages paths, app name and offline shell work', async ({ page, context }) => {
  await expect(page).toHaveTitle('sumi.')
  const manifest = await (await page.request.get('manifest.webmanifest')).json()
  expect(manifest.name).toBe('sumi.')
  expect(manifest.short_name).toBe('sumi.')
  expect(manifest.start_url).toBe('/sumi/')
  expect(manifest.scope).toBe('/sumi/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  // Prompt mode intentionally does not claim an already open client.
  await page.reload()
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Text editor' })).toBeVisible()
})

test('documents and undo histories stay independent across tabs', async ({ page }) => {
  await write(page, 'first document')
  await page.getByRole('button', { name: 'New tab', exact: true }).click()
  await write(page, 'second document')
  await page.getByRole('tab', { name: 'first document', exact: true }).click()
  await expect(page.getByRole('textbox')).toHaveText('first document')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByRole('textbox')).toHaveText('')
  await page.getByRole('tab', { name: 'second document', exact: true }).click()
  await expect(page.getByRole('textbox')).toHaveText('second document')
})

test('keyboard tab navigation keeps focus and works in both orientations', async ({ page }) => {
  await write(page, 'first')
  await page.getByRole('button', { name: 'New tab', exact: true }).click()
  await write(page, 'second')
  const first = page.getByRole('tab', { name: 'first', exact: true })
  const second = page.getByRole('tab', { name: 'second', exact: true })
  await second.focus()
  await second.press('ArrowLeft')
  await expect(first).toBeFocused()
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await first.press('End')
  await expect(second).toBeFocused()
  await page.getByRole('button', { name: 'Toggle tab layout' }).click()
  await second.focus()
  await second.press('ArrowUp')
  await expect(first).toBeFocused()
  await first.press('Delete')
  await expect(page.getByRole('tab')).toHaveCount(1)
  await expect(second).toBeFocused()
  await second.press('Delete')
  await expect(page.getByRole('tab')).toHaveCount(1)
  await expect(page.getByRole('tab')).toHaveText('untitled')
})

test('Unicode titles do not split supplementary characters', async ({ page }) => {
  await write(page, `${'a'.repeat(26)}😀xy`)
  await expect(page.getByRole('tab')).toHaveText(`${'a'.repeat(26)}😀…`)
})

test('leaving warns for text in active and inactive tabs, but not empty tabs', async ({ page }) => {
  expect(await unloadIsPrevented(page)).toBe(false)
  await write(page, 'keep this')
  expect(await unloadIsPrevented(page)).toBe(true)
  await page.getByRole('button', { name: 'New tab', exact: true }).click()
  expect(await unloadIsPrevented(page)).toBe(true)
  await page.getByRole('button', { name: 'Close keep this', exact: true }).click()
  expect(await unloadIsPrevented(page)).toBe(false)
})

test('Alt shortcuts ignore repeats and composition', async ({ page }) => {
  await page.keyboard.press('Alt+KeyN')
  await expect(page.getByRole('tab')).toHaveCount(2)
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', altKey: true, repeat: true, bubbles: true, cancelable: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', altKey: true, isComposing: true, bubbles: true, cancelable: true }))
  })
  await expect(page.getByRole('tab')).toHaveCount(2)
  await page.keyboard.press('Alt+KeyW')
  await expect(page.getByRole('tab')).toHaveCount(1)
})

test('scroll position is restored when returning to a long document', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 600 })
  await page.evaluate(() => document.fonts.ready)
  await write(page, Array.from({ length: 120 }, (_, i) => `line ${i + 1}`).join('\n'))
  // Inserting content schedules measurement and caret scrolling.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const scroller = page.locator('.cm-scroller')
  await scroller.evaluate((el) => { el.scrollTop = 500 })
  // Let CodeMirror measure the scroll anchor before leaving.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const savedScroll = await scroller.evaluate((el) => Math.round(el.scrollTop))
  expect(savedScroll).toBeGreaterThan(400)
  await page.getByRole('button', { name: 'New tab', exact: true }).click()
  await page.getByRole('tab', { name: 'line 1', exact: true }).click()
  await expect.poll(() => scroller.evaluate((el) => Math.round(el.scrollTop))).toBe(savedScroll)
})

test('compact padding and narrow vertical layout leave room to write', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await expect(page.locator('.cm-content')).toHaveCSS('padding-top', '16px')
  await expect(page.locator('.cm-line').first()).toHaveCSS('padding-left', '36px')
  await page.getByRole('button', { name: 'Toggle tab layout' }).click()
  await page.setViewportSize({ width: 360, height: 740 })
  const bounds = await page.locator('.editor').boundingBox()
  expect(bounds!.width).toBeGreaterThan(230)
  await write(page, 'compact view')
  await expect(page.getByRole('textbox')).toHaveText('compact view')
  await page.screenshot({ path: 'test-results/compact-editor.png' })
})
