import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

async function revision(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sumi:workspaces', 2)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = database.transaction('workspaces', 'readonly').objectStore('workspaces').get(sessionStorage.getItem('sumi:workspace')!)
        request.onsuccess = () => resolve(request.result.revision)
        request.onerror = () => reject(request.error)
      })
    } finally { database.close() }
  })
}

test('syntax loading and selecting the active tab do not create another autosave', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const page = await context.newPage()
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const report = JSON.parse(readFileSync('dist/language-bundle-report.json', 'utf8'))
  await page.route(`**/sumi/${report.languagePacks.python.entryFile}`, async route => { await gate; await route.continue() })
  try {
    await page.goto('./')
    const status = page.locator('[data-storage-status]')
    await expect(status).toHaveAttribute('data-storage-status', 'saved')
    await page.getByRole('button', { name: 'Choose language', exact: true }).click()
    await page.getByRole('dialog', { name: 'Language', exact: true }).getByRole('button', { name: 'Python', exact: true }).click()
    await expect(status).toHaveAttribute('data-storage-status', 'saved')
    const before = await revision(page)
    release()
    await expect(page.getByRole('button', { name: 'Choose language', exact: true })).toHaveAttribute('data-language-status', 'ready')
    await page.getByRole('tab').first().click()
    await page.waitForTimeout(700)
    expect(await revision(page)).toBe(before)
    await expect(status).toHaveAttribute('data-storage-status', 'saved')
  } finally { release(); await context.close() }
})

test('switching tabs saves only the workspace row and never rewrites document text', async ({ page }) => {
  await page.goto('./')
  const editor = page.getByRole('textbox', { name: 'Text editor' })
  const status = page.locator('[data-storage-status]')
  await expect(status).toHaveAttribute('data-storage-status', 'saved')
  await editor.fill('first document with text')
  await expect(status).toHaveAttribute('data-storage-status', 'saved')
  await page.getByRole('button', { name: 'New tab', exact: true }).click()
  await editor.fill('second document with text')
  await expect(status).toHaveAttribute('data-storage-status', 'saved')

  // Record the object store of every IndexedDB put the app issues.
  await page.evaluate(() => {
    const writes: string[] = []
    const put = IDBObjectStore.prototype.put
    Object.assign(window, { storeWrites: writes })
    IDBObjectStore.prototype.put = function (value, key) {
      writes.push(this.name)
      return put.call(this, value, key)
    }
  })
  await page.getByRole('tab').first().click()
  await expect(status).toHaveAttribute('data-storage-status', 'saved')
  await page.waitForTimeout(700)
  const writes = await page.evaluate(() => (window as unknown as { storeWrites: string[] }).storeWrites)
  expect(writes).toContain('workspaces')
  expect(writes).not.toContain('texts')
  expect(writes).not.toContain('documents')
})
