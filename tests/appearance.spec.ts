import { expect, test, type Page } from '@playwright/test'

const editor = (page: Page) => page.getByRole('textbox', { name: 'Text editor' })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Settings', exact: true })
const html = (page: Page) => page.locator('html')

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(dialog(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('./')
})

test('line numbers are off by default, toggle from settings and the keyboard, and persist', async ({ page }) => {
  const gutter = page.locator('.cm-gutters')
  await expect(gutter).toBeHidden()
  await editor(page).fill('one\ntwo\nthree')
  await openSettings(page)
  const toggle = dialog(page).getByRole('switch', { name: /Line numbers/ })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(gutter).toBeVisible()
  await expect(page.locator('.cm-lineNumbers .cm-gutterElement').filter({ hasText: /^3$/ })).toBeVisible()
  // Numbers are not part of the text.
  await expect(editor(page)).toHaveText('onetwothree')
  await page.reload()
  await expect(gutter).toBeVisible()
  // Alt+Shift+N flips it back.
  await editor(page).focus()
  await page.keyboard.press('Alt+Shift+KeyN')
  await expect(gutter).toBeHidden()
  await page.keyboard.press('Alt+Shift+KeyN')
  await expect(gutter).toBeVisible()
})

test('line numbers are subtle and the current line stands out', async ({ page }) => {
  await editor(page).fill('one\ntwo\nthree')
  await page.keyboard.press('Alt+Shift+KeyN')
  const numbers = page.locator('.cm-lineNumbers .cm-gutterElement:visible').filter({ hasText: /^\d$/ })
  await expect(numbers).toHaveCount(3)
  const active = page.locator('.cm-lineNumbers .cm-activeLineGutter')
  await expect(active).toHaveText('3')
  expect(Number(await active.evaluate((el) => getComputedStyle(el).opacity))).toBe(1)
  const quiet = numbers.first()
  expect(Number(await quiet.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.8)
  // Line numbers do not take over the editor's width on a phone.
  await page.setViewportSize({ width: 375, height: 740 })
  const gutter = await page.locator('.cm-gutters').boundingBox()
  expect(gutter!.width).toBeLessThan(70)
})

test('theme and mode apply immediately, persist and survive reload without a flash', async ({ page }) => {
  await expect(html(page)).toHaveAttribute('data-theme', 'sumi')
  await openSettings(page)
  const mode = dialog(page).getByRole('group', { name: 'Colour mode' })
  await mode.getByRole('button', { name: 'Dark' }).click()
  await expect(html(page)).toHaveAttribute('data-mode', 'dark')
  const sumiDark = await editor(page).evaluate(() => getComputedStyle(document.body).backgroundColor)
  const themes = dialog(page).getByRole('group', { name: 'Theme' })
  await themes.getByRole('button', { name: 'Solarized' }).click()
  await expect(html(page)).toHaveAttribute('data-theme', 'solarized')
  await expect(themes.getByRole('button', { name: 'Solarized' })).toHaveAttribute('aria-pressed', 'true')
  await expect(themes.getByRole('button', { name: 'Sumi' })).toHaveAttribute('aria-pressed', 'false')
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(sumiDark)
  await mode.getByRole('button', { name: 'Light' }).click()
  await expect(html(page)).toHaveAttribute('data-mode', 'light')
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light')
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(html(page)).toHaveAttribute('data-theme', 'solarized')
  await expect(html(page)).toHaveAttribute('data-mode', 'light')
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', /^#|rgb/)
})

test('system mode follows the operating system and manual modes ignore it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(html(page)).toHaveAttribute('data-mode', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(html(page)).toHaveAttribute('data-mode', 'light')
  await openSettings(page)
  const mode = dialog(page).getByRole('group', { name: 'Colour mode' })
  await expect(mode.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true')
  await mode.getByRole('button', { name: 'Dark' }).click()
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(html(page)).toHaveAttribute('data-mode', 'dark')
})

test('every theme is readable in both modes', async ({ page }) => {
  await openSettings(page)
  const themes = dialog(page).getByRole('group', { name: 'Theme' })
  const mode = dialog(page).getByRole('group', { name: 'Colour mode' })
  const names = await themes.getByRole('button').allInnerTexts()
  expect(names.map((name) => name.trim())).toEqual(['Sumi', 'Solarized', 'GitHub', 'One', 'Gruvbox', 'Catppuccin'])
  for (const modeName of ['Light', 'Dark']) {
    await mode.getByRole('button', { name: modeName }).click()
    for (const name of names) {
      await themes.getByRole('button', { name: name.trim() }).click()
      const colours = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement)
        const probe = document.createElement('i')
        document.body.append(probe)
        const rgb = (variable: string) => {
          probe.style.color = `var(${variable})`
          return getComputedStyle(probe).color.match(/[\d.]+/g)!.slice(0, 3).map(Number)
        }
        const result = { bg: rgb('--bg'), fg: rgb('--fg'), muted: rgb('--muted'), keyword: rgb('--syntax-keyword'), comment: rgb('--syntax-comment'), defined: style.getPropertyValue('--syntax-type').trim() !== '' }
        probe.remove()
        return result
      })
      const luminance = ([r, g, b]: number[]) => {
        const [lr, lg, lb] = [r, g, b].map((c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
        return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
      }
      const contrast = (a: number[], b: number[]) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }
      expect(colours.defined, `${name} ${modeName} defines syntax tokens`).toBe(true)
      expect(contrast(colours.fg, colours.bg), `${name} ${modeName} text`).toBeGreaterThanOrEqual(7)
      expect(contrast(colours.muted, colours.bg), `${name} ${modeName} muted`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(colours.keyword, colours.bg), `${name} ${modeName} keyword`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(colours.comment, colours.bg), `${name} ${modeName} comment`).toBeGreaterThanOrEqual(4.5)
    }
  }
})
