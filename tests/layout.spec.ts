import { expect, test, type Page } from '@playwright/test'

const list = (page: Page) => page.getByRole('tablist', { name: 'Open documents' })
const more = (page: Page) => page.getByRole('button', { name: 'More actions', exact: true })

async function openTabs(page: Page, count: number) {
  for (let i = 1; i < count; i++) await page.getByRole('button', { name: 'New tab', exact: true }).click()
  await expect(page.getByRole('tab')).toHaveCount(count)
}

test.beforeEach(async ({ page }) => {
  await page.goto('./')
})

test('horizontal tab strip scrolls sideways only and keeps the active tab in view', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 })
  await openTabs(page, 24)
  const strip = list(page)
  const metrics = await strip.evaluate((el) => ({
    overflowY: getComputedStyle(el).overflowY,
    vertical: el.scrollHeight - el.clientHeight,
    horizontal: el.scrollWidth - el.clientWidth,
  }))
  expect(metrics.overflowY).toBe('hidden')
  expect(metrics.vertical).toBeLessThanOrEqual(0)
  expect(metrics.horizontal).toBeGreaterThan(0)
  // A vertical wheel moves the strip sideways and never up or down.
  await strip.hover()
  await page.mouse.wheel(0, -400)
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeLessThan(metrics.horizontal)
  expect(await strip.evaluate((el) => el.scrollTop)).toBe(0)
  // Selecting the first tab by keyboard brings it back into view.
  await page.keyboard.press('Alt+1')
  const first = page.getByRole('tab').first()
  await expect.poll(() => first.evaluate((el) => {
    const tab = el.getBoundingClientRect()
    const box = el.closest('[role=tablist]')!.getBoundingClientRect()
    return tab.left >= box.left - 1 && tab.right <= box.right + 1
  })).toBe(true)
})

test('phones keep New tab visible and move other actions into a menu', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 })
  await expect(page.getByRole('button', { name: 'New tab', exact: true })).toBeVisible()
  for (const name of ['Open file', 'Export file', 'Recently closed', 'Toggle tab layout', 'Keyboard shortcuts']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
  }
  // Keyboard activation moves focus into the menu.
  await more(page).focus()
  await page.keyboard.press('Enter')
  await expect(more(page)).toHaveAttribute('aria-expanded', 'true')
  for (const name of ['Rename tab', 'Open file', 'Export file', 'Recently closed', 'Use vertical tabs', 'Keyboard shortcuts']) {
    await expect(page.getByRole('menuitem', { name, exact: true })).toBeVisible()
  }
  await expect(page.getByRole('menuitem', { name: 'Rename tab', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'Open file', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menuitem').first()).toBeHidden()
  await expect(more(page)).toBeFocused()
  await expect(more(page)).toHaveAttribute('aria-expanded', 'false')
  // Outside taps close it as well.
  await more(page).click()
  await page.getByRole('textbox', { name: 'Text editor' }).click()
  await expect(page.getByRole('menuitem').first()).toBeHidden()
})

test('menu actions restore focus to the menu button after their dialog closes', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 })
  await more(page).click()
  await page.getByRole('menuitem', { name: 'Keyboard shortcuts', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  await page.getByRole('button', { name: 'Close keyboard shortcuts' }).click()
  await expect(more(page)).toBeFocused()
})

test('vertical tabs become a drawer on phones', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 })
  await openTabs(page, 4)
  await more(page).click()
  await page.getByRole('menuitem', { name: 'Use vertical tabs', exact: true }).click()
  await expect(page.locator('.app')).toHaveAttribute('data-tab-layout', 'vertical')
  // The editor spans the full width; the tab list is off-screen until requested.
  const editor = await page.locator('.editor').boundingBox()
  expect(editor!.width).toBeGreaterThan(360)
  await expect(page.getByRole('tab')).toHaveCount(0)
  const toggle = page.getByRole('button', { name: 'Show tabs', exact: true })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('tab')).toHaveCount(4)
  await expect(page.getByRole('tab').last()).toBeFocused()
  // Escape closes the drawer and returns focus to its button.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(toggle).toBeFocused()
  // Choosing a tab switches to it and closes the drawer.
  await toggle.click()
  await page.getByRole('tab').first().click()
  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toBeFocused()
  // Keyboard selection also returns focus to the visible drawer control.
  // Cover both selecting the current tab and switching to another tab.
  for (const key of ['Enter', 'Space']) {
    await toggle.click()
    await expect(page.getByRole('tab').first()).toBeFocused()
    if (key === 'Space') await page.keyboard.press('ArrowDown')
    const selectedId = await page.getByRole('tab', { selected: true }).getAttribute('id')
    await page.keyboard.press(key)
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toBeFocused()
    await expect(page.locator('.editor')).toHaveAttribute('aria-labelledby', selectedId!)
  }
  // Growing back to a desktop width restores the sidebar.
  await page.setViewportSize({ width: 1000, height: 700 })
  await expect(page.getByRole('tab')).toHaveCount(4)
  await expect(page.getByRole('button', { name: 'Toggle tab layout', exact: true })).toBeVisible()
})

test('the status bar is docked below the editor and never overlaps it', async ({ page }) => {
  for (const viewport of [{ width: 1000, height: 600 }, { width: 375, height: 740 }]) {
    await page.setViewportSize(viewport)
    const editor = await page.locator('.editor').boundingBox()
    const status = await page.locator('.status').boundingBox()
    expect(status!.y).toBeGreaterThanOrEqual(editor!.y + editor!.height - 1)
    expect(status!.x + status!.width).toBeLessThanOrEqual(viewport.width + 1)
  }
})
