import { expect, test, type Page } from '@playwright/test'

const editor = (page: Page) => page.getByRole('textbox', { name: 'Text editor' })
const sizeDialog = (page: Page) => page.getByRole('dialog', { name: 'Settings', exact: true })
const sizeSlider = (page: Page) => sizeDialog(page).getByRole('slider', { name: 'Editor font size' })

async function openSizeDialog(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(sizeDialog(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('./')
})

test('font size defaults to 16px, adjusts in one-pixel steps and persists on this device', async ({ page }) => {
  await expect.poll(() => editor(page).evaluate(el => getComputedStyle(el).fontSize)).toBe('16px')
  await openSizeDialog(page)
  await expect(sizeSlider(page)).toHaveAttribute('min', '16')
  await expect(sizeSlider(page)).toHaveAttribute('max', '28')
  await expect(sizeSlider(page)).toHaveAttribute('step', '1')
  await expect(sizeSlider(page)).toHaveValue('16')

  await sizeDialog(page).getByRole('button', { name: 'Increase font size', exact: true }).click()
  await expect(sizeSlider(page)).toHaveValue('17')
  await sizeDialog(page).getByRole('button', { name: 'Increase font size', exact: true }).click()
  await expect.poll(() => editor(page).evaluate(el => getComputedStyle(el).fontSize)).toBe('18px')
  await page.keyboard.press('Escape')

  await page.reload()
  await expect.poll(() => editor(page).evaluate(el => getComputedStyle(el).fontSize)).toBe('18px')
  await openSizeDialog(page)
  await expect(sizeSlider(page)).toHaveValue('18')
  await sizeDialog(page).getByRole('button', { name: 'Reset font size', exact: true }).click()
  await expect(sizeSlider(page)).toHaveValue('16')
  await expect.poll(() => editor(page).evaluate(el => getComputedStyle(el).fontSize)).toBe('16px')
})

test('changing font size preserves the caret, document and undo history', async ({ page }) => {
  await editor(page).fill('alpha')
  await page.keyboard.insertText(' beta')
  await editor(page).press('End')
  await expect(page.locator('.status')).toContainText('Ln 1, Col 11')
  const before = await editor(page).innerText()

  await openSizeDialog(page)
  await sizeDialog(page).getByRole('button', { name: 'Increase font size', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(editor(page)).toHaveText(before)
  await expect(page.locator('.status')).toContainText('Ln 1, Col 11')

  await editor(page).focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(editor(page)).not.toHaveText(before)
})

test('iPhone-sized layout keeps editable text at 16px and leaves pinch zoom enabled', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  try {
    await page.goto('./')
    await expect.poll(() => editor(page).evaluate(el => getComputedStyle(el).fontSize)).toBe('16px')
    await page.getByRole('button', { name: 'Choose language', exact: true }).tap()
    const search = page.getByRole('searchbox', { name: 'Search languages' })
    await expect(page.getByRole('dialog', { name: 'Language' })).toBeVisible()
    expect(await search.evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16)
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
    expect(viewport).toContain('initial-scale=1.0')
    expect(viewport).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0)?(?:,|$)/i)
  } finally {
    await context.close()
  }
})
