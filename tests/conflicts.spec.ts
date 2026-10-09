import { expect, test, type Page } from '@playwright/test'

const editor = (page: Page) => page.getByRole('textbox', { name: 'Text editor' })
const storage = (page: Page) => page.locator('[data-storage-status]')

async function saved(page: Page) {
  await expect(storage(page)).toHaveAttribute('data-storage-status', 'saved')
}

async function workspaces(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sumi:workspaces', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const transaction = database.transaction('workspaces', 'readonly')
      const request = transaction.objectStore('workspaces').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    database.close()
    return rows as { id: string; revision: number; documents: { text: string }[] }[]
  })
}

test('a revision conflict retries into an independent workspace and preserves both drafts', async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
  })
  await page.goto('./')
  await saved(page)
  await editor(page).fill('shared baseline')
  await saved(page)

  const second = await context.newPage()
  await second.goto('./')
  await saved(second)
  await expect(editor(second)).toHaveText('shared baseline')
  const originalId = await page.evaluate(() => sessionStorage.getItem('sumi:workspace'))
  expect(await second.evaluate(() => sessionStorage.getItem('sumi:workspace'))).toBe(originalId)

  // The second window's startup save advances the shared row revision. It
  // can write next; the older first window must safely fork on its next save.
  await editor(second).fill('second window draft')
  await saved(second)
  await editor(page).fill('first window draft')
  await expect(storage(page)).toHaveAttribute('data-storage-status', 'error')
  await expect(page.getByRole('status')).toContainText('separate workspace')
  await expect(editor(page)).toHaveText('first window draft')

  await page.getByRole('button', { name: 'Retry saving', exact: true }).click()
  await saved(page)
  const forkId = await page.evaluate(() => sessionStorage.getItem('sumi:workspace'))
  expect(forkId).toBeTruthy()
  expect(forkId).not.toBe(originalId)

  const records = await workspaces(page)
  const original = records.find(workspace => workspace.id === originalId)
  const fork = records.find(workspace => workspace.id === forkId)
  expect(original?.documents.some(document => document.text === 'second window draft')).toBe(true)
  expect(fork?.documents.some(document => document.text === 'first window draft')).toBe(true)

  await page.reload()
  await saved(page)
  await expect(editor(page)).toHaveText('first window draft')
  await page.close()
  await second.close()
})

test('pending empty workspace changes still block unload', async ({ page }) => {
  await page.goto('./')
  await saved(page)
  await page.clock.install()
  await page.getByRole('button', { name: 'New tab', exact: true }).click()
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })).toBe(true)
})
