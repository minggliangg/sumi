import { expect, test, type Page } from '@playwright/test'

const editor = (page: Page) => page.getByRole('textbox', { name: 'Text editor' })
const status = (page: Page) => page.locator('[data-storage-status]')
const toggle = (page: Page) => page.locator('.preview-toggle')
const preview = (page: Page) => page.locator('.preview-body')

async function saved(page: Page) {
  await expect(status(page)).toHaveAttribute('data-storage-status', 'saved')
}

async function chooseMarkdown(page: Page) {
  await page.getByRole('button', { name: 'Choose language', exact: true }).click()
  await page.getByRole('dialog', { name: 'Language', exact: true }).getByRole('button', { name: 'Markdown', exact: true }).click()
}

const SAMPLE = [
  '# Heading',
  '',
  '- first item',
  '',
  '<script>window.pwned = true</script>',
  '',
  '[bad link](javascript:window.pwned=true)',
  '',
  '![remote](https://example.com/pixel.png)',
].join('\n')

test('the preview toggle appears only for Markdown tabs', async ({ page }) => {
  await page.goto('./')
  await saved(page)
  await editor(page).fill('plain text, not markdown')
  await saved(page)
  await expect(toggle(page)).toHaveCount(0)
  await chooseMarkdown(page)
  await expect(toggle(page)).toBeVisible()
  await expect(toggle(page)).toHaveText('Preview')
})

test('wide windows split the editor and preview, sanitize output and follow edits', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./')
  await saved(page)
  await editor(page).fill(SAMPLE)
  await saved(page)
  await chooseMarkdown(page)
  await toggle(page).click()

  await expect(page.locator('.editor-area')).toHaveAttribute('data-preview', 'split')
  await expect(page.getByRole('region', { name: 'Markdown preview' })).toBeVisible()
  await expect(preview(page).getByRole('heading', { name: 'Heading' })).toBeVisible()
  await expect(preview(page).getByText('first item')).toBeVisible()

  // Raw HTML is shown as text, not executed or kept as markup.
  await expect(preview(page).locator('script')).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { pwned?: boolean }).pwned)).toBeUndefined()
  // Unsafe link targets are not turned into links.
  await expect(preview(page).locator('a[href^="javascript"]')).toHaveCount(0)
  // Remote images are held back until the reader asks for them.
  const blocked = preview(page).locator('.blocked-image')
  await expect(blocked).toHaveAttribute('data-blocked-src', 'https://example.com/pixel.png')
  await expect(blocked).not.toHaveAttribute('src')

  await editor(page).fill('# Updated\n\nnew body')
  await expect(preview(page).getByRole('heading', { name: 'Updated' })).toBeVisible()
  await expect(preview(page).getByText('new body')).toBeVisible()

  await page.getByRole('button', { name: 'Hide preview', exact: true }).click()
  await expect(page.locator('.editor-area')).toHaveAttribute('data-preview', 'off')
  await expect(editor(page)).toBeVisible()
})

test('narrow windows swap between the editor and a full-width preview', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await saved(page)
  await editor(page).fill(SAMPLE)
  await saved(page)
  await chooseMarkdown(page)
  await toggle(page).click()

  await expect(page.locator('.editor-area')).toHaveAttribute('data-preview', 'full')
  await expect(editor(page)).toBeHidden()
  await expect(preview(page).getByRole('heading', { name: 'Heading' })).toBeVisible()
  await expect(toggle(page)).toHaveText('Edit')

  await toggle(page).click()
  await expect(page.locator('.editor-area')).toHaveAttribute('data-preview', 'off')
  await expect(editor(page)).toBeVisible()
})

test('Alt+Shift+P toggles the preview for Markdown tabs only', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./')
  await saved(page)
  await editor(page).fill('# not yet markdown')
  await editor(page).click()
  await page.keyboard.press('Alt+Shift+P')
  await expect(page.locator('.editor-area')).toHaveAttribute('data-preview', 'off')

  await chooseMarkdown(page)
  await editor(page).click()
  await page.keyboard.press('Alt+Shift+P')
  await expect(page.locator('.editor-area')).toHaveAttribute('data-preview', 'split')
  await page.keyboard.press('Alt+Shift+P')
  await expect(page.locator('.editor-area')).toHaveAttribute('data-preview', 'off')
})

test('very large documents pause the preview until the reader asks for it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./')
  await saved(page)
  await editor(page).fill('# big\n' + 'x'.repeat(600 * 1024))
  await saved(page)
  await chooseMarkdown(page)
  await toggle(page).click()

  await expect(page.locator('.preview-paused')).toBeVisible()
  await page.getByRole('button', { name: 'Render preview', exact: true }).click()
  await expect(preview(page).getByRole('heading', { name: 'big' })).toBeVisible()
})
