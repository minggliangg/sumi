import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const editor = (page: Page) => page.getByRole('textbox', { name: 'Text editor' })
const format = (page: Page) => page.getByRole('button', { name: 'Format document', exact: true })
async function choose(page: Page, name: string) {
  await page.getByRole('button', { name: 'Choose language', exact: true }).click()
  await page.getByRole('dialog', { name: 'Language', exact: true }).getByRole('button', { name, exact: true }).click()
  await expect(page.getByRole('button', { name: 'Choose language', exact: true })).toHaveAttribute('data-language-status', /^(ready|plain)$/)
}
async function completed(page: Page) {
  await expect(format(page)).toHaveAttribute('data-format-status', 'idle', { timeout: 20000 })
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', dialog => dialog.accept())
  await page.goto('./')
})

for (const [name, source, expected] of [
  ['JavaScript', 'const answer={value:42};', 'const answer = { value: 42 };'],
  ['TypeScript', 'const answer:number=42;', 'const answer: number = 42;'],
  ['JSX', 'const App=()=> <div title="hello">Hello</div>;', 'const App = () =>'],
  ['TSX', 'const App=():JSX.Element=> <div>Hello</div>;', 'const App = (): JSX.Element =>'],
  ['JSON', '{"hello":true,"number":42}', '"hello": true,'],
  ['CSS', 'body{color:red;margin:0}', 'color: red;'],
  ['HTML', '<!doctype html><html><body><p>Hello</p></body></html>', '<p>Hello</p>'],
  ['Markdown', '# Hello\n\n- one\n- two', '# Hello'],
  ['Python', 'def greet():\n return  42', 'return 42'],
  ['SQL', 'select name from people where active=1;', 'SELECT'],
] as const) {
  test(`formats ${name} locally`, async ({ page }) => {
    await editor(page).fill(source)
    await choose(page, name)
    await format(page).click()
    await completed(page)
    await expect(editor(page)).toContainText(expected)
  })
}

test('plain and large documents cannot format', async ({ page }) => {
  await expect(format(page)).toBeDisabled()
  await editor(page).fill('some ordinary prose')
  await choose(page, 'Plain text')
  await expect(format(page)).toBeDisabled()
  await choose(page, 'Python')
  await editor(page).fill('界'.repeat(Math.ceil(5 * 1024 * 1024 / 3)))
  await expect(format(page)).toBeDisabled()
})

test('formatting is one undoable edit and an unchanged format adds no history', async ({ page }) => {
  const source = 'const answer={value:42};'
  await editor(page).fill(source)
  await choose(page, 'JavaScript')
  await format(page).click()
  await completed(page)
  const formatted = await editor(page).innerText()
  expect(formatted).not.toBe(source)
  await format(page).click()
  await completed(page)
  await editor(page).focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(editor(page)).toHaveText(source)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(editor(page)).toHaveText(formatted)
})

for (const [name, source] of [['JavaScript', 'const = ;'], ['JSON', '{"broken":}'], ['Python', 'def broken(:\n  pass']] as const) {
  test(`invalid ${name} leaves text unchanged`, async ({ page }) => {
    await editor(page).fill(source)
    await choose(page, name)
    await format(page).click()
    await expect(format(page)).toHaveAttribute('data-format-status', 'error', { timeout: 20000 })
    await expect(editor(page)).toHaveText(source)
    await expect(page.locator('.status')).toContainText(/format|syntax|invalid/i)
  })
}

test('keyboard formatting preserves selection and scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 600 })
  await page.evaluate(() => document.fonts.ready)
  await editor(page).fill(Array.from({ length: 100 }, (_, i) => `const value${i}=${i};`).join('\n'))
  await choose(page, 'JavaScript')
  await editor(page).focus()
  await page.keyboard.press('ControlOrMeta+Home')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.locator('.status')).toContainText('5 selected')
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const scroller = page.locator('.cm-scroller')
  await scroller.evaluate(el => { el.scrollTop = 500 })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const before = await scroller.evaluate(el => Math.round(el.scrollTop))
  await page.keyboard.press('Control+Shift+f')
  await completed(page)
  await expect(editor(page)).toContainText('const value0 = 0;')
  await expect(page.locator('.status')).toContainText('5 selected')
  await expect.poll(() => scroller.evaluate(el => Math.round(el.scrollTop))).toBe(before)
})

test('empty formatting does not add undo history', async ({ page }) => {
  await choose(page, 'JavaScript')
  if (await format(page).isEnabled()) {
    await format(page).click()
    await completed(page)
  }
  await expect(editor(page)).toHaveText('')
  await editor(page).focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(editor(page)).toHaveText('')
})

function formatterEntry() {
  const report = JSON.parse(readFileSync('dist/language-bundle-report.json', 'utf8')) as { formatterPacks: Record<string, { entryFile: string }> }
  return report.formatterPacks.worker.entryFile
}

for (const action of ['edit', 'language', 'switch', 'close'] as const) {
  test(`delayed formatting handles ${action} without overwriting another document`, async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    const page = await context.newPage()
    page.on('dialog', dialog => dialog.accept())
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    await context.route(`**/${formatterEntry()}`, async route => { await gate; await route.continue() })
    try {
      await page.goto('./')
      await editor(page).fill('const original={value:42};')
      await choose(page, 'JavaScript')
      await format(page).click()
      await expect(format(page)).toHaveAttribute('data-format-status', 'formatting')
      if (action === 'edit') await editor(page).fill('const newer = 7;')
      if (action === 'language') await choose(page, 'Plain text')
      if (action === 'switch' || action === 'close') {
        await page.getByRole('button', { name: 'New tab', exact: true }).click()
        await editor(page).fill('keep this new document')
        if (action === 'close') await page.getByRole('button', { name: /^Close const original/ }).click()
      }
      release()
      if (action === 'edit' || action === 'language') {
        await expect(page.locator('.status')).toContainText('Document changed. Format again.', { timeout: 20000 })
        await expect(editor(page)).toHaveText(action === 'edit' ? 'const newer = 7;' : 'const original={value:42};')
      } else {
        await expect(editor(page)).toHaveText('keep this new document')
        if (action === 'switch') {
          await page.getByRole('tab').first().click()
          await completed(page)
          await expect(editor(page)).toHaveText('const original = { value: 42 };')
        } else {
          await page.waitForTimeout(500)
          await expect(page.getByRole('tab')).toHaveCount(1)
        }
      }
    } finally {
      release()
      await context.close()
    }
  })
}

test('formatter download failure is retryable', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const page = await context.newPage()
  page.on('dialog', dialog => dialog.accept())
  const entry = formatterEntry()
  try {
    await context.route(`**/${entry}`, route => route.abort())
    await page.goto('./')
    await editor(page).fill('const answer={value:42};')
    await choose(page, 'JavaScript')
    await format(page).click()
    await expect(format(page)).toHaveAttribute('data-format-status', 'error', { timeout: 20000 })
    await expect(editor(page)).toHaveText('const answer={value:42};')
    await context.unroute(`**/${entry}`)
    await format(page).click()
    await completed(page)
    await expect(editor(page)).toHaveText('const answer = { value: 42 };')
  } finally { await context.close() }
})

test('cached formatter works after an offline reload', async ({ page, context }) => {
  await editor(page).fill('const answer={value:42};')
  await choose(page, 'JavaScript')
  await format(page).click()
  await completed(page)
  await expect(editor(page)).toHaveText('const answer = { value: 42 };')
  await context.setOffline(true)
  await page.reload()
  await editor(page).fill('const offline={works:true};')
  await choose(page, 'JavaScript')
  await format(page).click()
  await completed(page)
  await expect(editor(page)).toHaveText('const offline = { works: true };')
})
