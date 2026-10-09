import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const editor = (page: Page) => page.getByRole('textbox', { name: 'Text editor' })
const language = (page: Page) => page.getByRole('button', { name: 'Choose language', exact: true })

async function choose(page: Page, name: string) {
  await language(page).click()
  await page.getByRole('dialog', { name: 'Language', exact: true }).getByRole('button', { name, exact: true }).click()
}

async function ready(page: Page, name: string) {
  await expect(language(page)).toContainText(name)
  await expect(language(page)).toHaveAttribute('data-language-status', /^(ready|plain)$/)
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', dialog => dialog.accept())
  await page.goto('./')
})

test('picker searches, isolates shortcuts and restores keyboard focus', async ({ page }) => {
  await language(page).click()
  const dialog = page.getByRole('dialog', { name: 'Language', exact: true })
  const search = dialog.getByRole('searchbox', { name: 'Search languages' })
  await expect(search).toBeFocused()
  await search.fill('pyth')
  await expect(dialog.getByRole('button', { name: 'Python', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'JavaScript', exact: true })).toHaveCount(0)
  await search.press('Control+Shift+Enter')
  await expect(page.getByRole('tab')).toHaveCount(1)
  await search.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(language(page)).toBeFocused()
})

test('manual languages are independent and reconfiguration preserves history and selection', async ({ page }) => {
  await editor(page).fill('const message = "hello";')
  await choose(page, 'JavaScript')
  await ready(page, 'JavaScript')
  await editor(page).focus()
  await page.keyboard.press('ControlOrMeta+a')
  await expect(page.locator('.status')).toContainText('24 selected')
  await choose(page, 'TypeScript')
  await ready(page, 'TypeScript')
  await expect(page.locator('.status')).toContainText('24 selected')
  await expect(editor(page)).toHaveText('const message = "hello";')
  await page.getByRole('button', { name: 'New tab', exact: true }).click()
  await editor(page).fill('def greet():\n    return "hello"')
  await choose(page, 'Plain text')
  await ready(page, 'Plain text')
  await page.getByRole('tab').first().click()
  await ready(page, 'TypeScript')
  await expect(page.locator('.cm-editor')).toHaveCount(1)
  await editor(page).focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(editor(page)).toHaveText('')
  await page.getByRole('tab').nth(1).click()
  await ready(page, 'Plain text')
  await expect(editor(page)).toContainText('def greet')
})

for (const [name, code] of [
  ['Python', 'def greet():\n    return "hello"'],
  ['JavaScript', 'const answer = 42;\nfunction greet() { return answer; }'],
  ['TypeScript', 'interface Person { name: string }\nconst person: Person = { name: "Ada" };'],
  ['CSS', 'body { color: red; margin: 0; }'],
  ['SQL', 'SELECT name FROM people WHERE active = 1;'],
  ['JSON', '{"hello": "world", "number": 42}'],
  ['HTML', '<!DOCTYPE html>\n<html><body>Hello</body></html>'],
  ['Markdown', '# Hello\n\n- first\n- second\n\n```python\nprint(42)\n```'],
] as const) {
  test(`Auto detects ${name} locally`, async ({ page }) => {
    await editor(page).fill(code)
    await ready(page, name)
    await choose(page, 'Plain text')
    await ready(page, 'Plain text')
    await choose(page, 'Auto')
    await ready(page, name)
  })
}

test('Auto leaves ambiguous prose plain and a manual choice overrides content', async ({ page }) => {
  await editor(page).fill('print("hello")')
  await page.waitForTimeout(900)
  await ready(page, 'Plain text')
  await choose(page, 'Python')
  await ready(page, 'Python')
  await editor(page).fill('{"this": "is JSON"}')
  await page.waitForTimeout(900)
  await ready(page, 'Python')
})

test('highlight tokens adapt to both themes and plain text removes them', async ({ page }) => {
  await editor(page).fill('def greet():\n    return "hello"')
  await choose(page, 'Python')
  await ready(page, 'Python')
  const keyword = page.locator('.cm-content span').filter({ hasText: /^def$/ }).first()
  await expect(keyword).toBeVisible()
  await page.emulateMedia({ colorScheme: 'light' })
  const light = await keyword.evaluate(el => getComputedStyle(el).color)
  expect(light).not.toBe(await editor(page).evaluate(el => getComputedStyle(el).color))
  await page.screenshot({ path: 'test-results/language-light.png' })
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => keyword.evaluate(el => getComputedStyle(el).color)).not.toBe(light)
  await page.screenshot({ path: 'test-results/language-dark.png' })
  await choose(page, 'Plain text')
  await expect(page.locator('.cm-content span').filter({ hasText: /^def$/ })).toHaveCount(0)
})

test('language reconfiguration retains settled scroll position', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 600 })
  await page.evaluate(() => document.fonts.ready)
  await editor(page).fill(Array.from({ length: 120 }, (_, i) => `const value${i} = ${i};`).join('\n'))
  await choose(page, 'Plain text')
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const scroller = page.locator('.cm-scroller')
  await scroller.evaluate(el => { el.scrollTop = 500 })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const top = await scroller.evaluate(el => Math.round(el.scrollTop))
  await choose(page, 'JavaScript')
  await ready(page, 'JavaScript')
  await expect.poll(() => scroller.evaluate(el => Math.round(el.scrollTop))).toBe(top)
})

test('used packs work after offline reload while uncached packs fail gracefully', async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await choose(page, 'Python')
  await ready(page, 'Python')
  await context.setOffline(true)
  await page.reload()
  await choose(page, 'Python')
  await ready(page, 'Python')
  await editor(page).fill('def greet():\n    return 42')
  await expect(page.locator('.cm-content span').filter({ hasText: /^def$/ })).toBeVisible()
  await choose(page, 'SQL')
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  await editor(page).fill('editing still works')
  await expect(editor(page)).toHaveText('editing still works')
  await context.setOffline(false)
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await ready(page, 'SQL')
})

test('UTF-8 size cutoff suspends highlighting and restores the chosen language', async ({ page }) => {
  test.setTimeout(60000)
  await choose(page, 'Python')
  await ready(page, 'Python')
  // Three-byte characters cross the byte threshold with fewer than 5 MiB characters.
  await editor(page).fill('界'.repeat(Math.ceil(5 * 1024 * 1024 / 3)))
  await expect(page.locator('.status')).toContainText('Large document · Plain text')
  await editor(page).fill('def small():\n    return 42')
  await ready(page, 'Python')
  await expect(page.locator('.status')).not.toContainText('Large document')
  await expect(page.locator('.tok-keyword').filter({ hasText: /^def$/ })).toBeVisible()
})

test('failed pack retries and stale requests cannot override a newer choice', async ({ page, context }) => {
  const report = JSON.parse(readFileSync('dist/language-bundle-report.json', 'utf8')) as { languagePacks: Record<string, { files: string[]; entryFile: string }> }
  const unique = (name: string) => report.languagePacks[name].entryFile
  const pythonRoute = `**/${unique('python')}`
  const sqlRoute = `**/${unique('sql')}`
  // Fresh browser without a controlling worker allows deterministic network interception.
  const fresh = await context.browser()!.newContext({ serviceWorkers: 'block' })
  const isolated = await fresh.newPage()
  isolated.on('dialog', dialog => dialog.accept())
  try {
    await isolated.route(pythonRoute, route => route.abort())
    await isolated.goto('./')
    await choose(isolated, 'Python')
    await expect(isolated.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
    await isolated.unroute(pythonRoute)
    await isolated.getByRole('button', { name: 'Retry', exact: true }).click()
    await ready(isolated, 'Python')
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    await isolated.route(sqlRoute, async route => { await gate; await route.continue() })
    await choose(isolated, 'SQL')
    await choose(isolated, 'Plain text')
    release()
    await isolated.waitForTimeout(500)
    await ready(isolated, 'Plain text')
  } finally {
    await fresh.close()
  }
})


test('initial installation excludes every unused language dependency', async ({ page }) => {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  const report = JSON.parse(readFileSync('dist/language-bundle-report.json', 'utf8')) as { combinedLanguages: { files: string[] } }
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys()
    const requests = await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(request => new URL(request.url).pathname)))
    return requests.flat()
  })
  for (const file of report.combinedLanguages.files) expect(cached).not.toContain(`/sumi/${file}`)
})

test('detected language stays sticky during edits but full-document paste resets it', async ({ page }) => {
  await editor(page).fill('def original():\n    return 42')
  await ready(page, 'Python')
  await editor(page).fill('{"new": "content"}')
  await page.waitForTimeout(900)
  await ready(page, 'Python')
  await editor(page).focus()
  await page.keyboard.press('ControlOrMeta+a')
  await editor(page).evaluate(el => {
    const data = new DataTransfer()
    data.setData('text/plain', '{"replacement": true}')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })
  await ready(page, 'JSON')
})

test('Python shebang is detected, conflicting signals and unsupported shebangs stay plain', async ({ page }) => {
  await editor(page).fill('#!/usr/bin/env python3\nprint("hello")')
  await ready(page, 'Python')
  await editor(page).fill('')
  await editor(page).fill('#!/bin/bash\necho hello')
  await page.waitForTimeout(900)
  await ready(page, 'Plain text')
  await editor(page).fill('def greet():\n    return 42\nconst value = 42;')
  await page.waitForTimeout(900)
  await ready(page, 'Plain text')
})

for (const name of ['JSX', 'TSX']) {
  test(`manual ${name} highlights JSX markup`, async ({ page }) => {
    await editor(page).fill('const App = () => <div title="hello">Hello</div>;')
    await choose(page, name)
    await ready(page, name)
    await expect(page.locator('.cm-content .tok-keyword').filter({ hasText: /^const$/ })).toBeVisible()
    await expect(page.locator('.cm-content .tok-string').filter({ hasText: /hello/ }).first()).toBeVisible()
  })
}

test('delayed loads update inactive tabs and ignore closed requesting tabs', async ({ browser }) => {
  const report = JSON.parse(readFileSync('dist/language-bundle-report.json', 'utf8')) as { languagePacks: Record<string, { files: string[]; entryFile: string }> }
  const python = report.languagePacks.python.entryFile
  for (const close of [false, true]) {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    const page = await context.newPage()
    page.on('dialog', dialog => dialog.accept())
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    await page.route(`**/${python}`, async route => { await gate; await route.continue() })
    try {
      await page.goto('./')
      await editor(page).fill('original')
      await choose(page, 'Python')
      await expect(language(page)).toHaveAttribute('data-language-status', 'loading')
      await page.getByRole('button', { name: 'New tab', exact: true }).click()
      await choose(page, 'Plain text')
      if (close) await page.getByRole('button', { name: 'Close original', exact: true }).click()
      release()
      await page.waitForTimeout(500)
      await ready(page, 'Plain text')
      if (close) await expect(page.getByRole('tab')).toHaveCount(1)
      else {
        await page.getByRole('tab', { name: 'original', exact: true }).click()
        await ready(page, 'Python')
      }
    } finally {
      release()
      await context.close()
    }
  }
})

test('language picker fits a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await language(page).click()
  const dialog = page.getByRole('dialog', { name: 'Language', exact: true })
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/language-picker-narrow.png' })
})


test('valid JSON remains JSON when string values contain code cues', async ({ page }) => {
  await editor(page).fill('{"example": "const value = 1"}')
  await ready(page, 'JSON')
})
