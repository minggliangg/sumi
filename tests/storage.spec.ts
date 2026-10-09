import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { expect, test, type Page } from '@playwright/test'

// Exercise the actual storage module against native Chromium IndexedDB without
// adding a test-only export or a database emulation dependency to the app.
async function moduleSource() {
  const source = await readFile('src/storage/workspace.ts', 'utf8')
  return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
}

const editor = (page: Page) => page.getByRole('textbox', { name: 'Text editor' })
const storage = (page: Page) => page.locator('[data-storage-status]')

async function saved(page: Page) {
  await expect(storage(page)).toHaveAttribute('data-storage-status', 'saved')
}

test('workspace commits write only the rows they change and reject competing revisions', async ({ page }) => {
  await page.goto('./')
  const result = await page.evaluate(async (source) => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    const { openWorkspaceStore, ConflictError } = await import(url)
    URL.revokeObjectURL(url)
    const first = await openWorkspaceStore()
    const second = await openWorkspaceStore()
    const id = crypto.randomUUID()
    const open = { id: 'one', section: 'open', sequence: 1, languageMode: 'python', selection: { anchor: 2, head: 7 }, scrollTop: 42, filename: 'draft.py' }
    const scrolled = { ...open, scrollTop: 90 }
    const closed = { id: 'closed', section: 'closed', sequence: 2, languageMode: 'plain', selection: { anchor: 0, head: 0 }, scrollTop: 0, closedAt: 122 }
    const initial = await first.commit({
      id, activeId: 'one', updatedAt: 123,
      documents: [open, closed], texts: [{ id: 'one', text: 'draft 📝' }, { id: 'closed', text: 'recover me' }], remove: [],
    }, 0)

    // Metadata only: the stored text must not change or be required.
    await first.commit({ id, activeId: 'closed', updatedAt: 124, documents: [scrolled], texts: [], remove: [] }, 1)

    const outcomes = await Promise.allSettled([
      first.commit({ id, activeId: 'one', updatedAt: 125, documents: [scrolled], texts: [{ id: 'one', text: 'first writer' }], remove: [] }, 2),
      second.commit({ id, activeId: 'one', updatedAt: 125, documents: [scrolled], texts: [{ id: 'one', text: 'second writer' }], remove: [] }, 2),
    ])
    const failure = outcomes.find(outcome => outcome.status === 'rejected') as PromiseRejectedResult
    const stored = await second.load(id)
    const summaries = await second.list()
    first.close(); second.close()

    const reopened = await openWorkspaceStore()
    const persisted = await reopened.load(id)
    reopened.close()
    return {
      initial, successful: outcomes.filter(outcome => outcome.status === 'fulfilled').length,
      conflict: failure.reason instanceof ConflictError,
      expected: failure.reason.expectedRevision, actual: failure.reason.actualRevision,
      stored, summary: summaries.find((workspace: { id: string }) => workspace.id === id), persisted,
    }
  }, await moduleSource())
  expect(result.initial).toBe(1)
  expect(result.successful).toBe(1)
  expect(result.conflict).toBe(true)
  expect(result.expected).toBe(2)
  expect(result.actual).toBe(3)
  expect(result.stored.revision).toBe(3)
  expect(result.summary.revision).toBe(3)
  expect(['first writer', 'second writer']).toContain(result.stored.documents[0].text)
  expect(result.stored.documents[0].selection).toEqual({ anchor: 2, head: 7 })
  expect(result.stored.documents[0].scrollTop).toBe(90)
  expect(result.stored.documents[0].filename).toBe('draft.py')
  expect(result.stored.documents[0].sequence).toBe(1)
  expect(result.stored.activeId).toBe('one')
  expect(result.stored.closed[0].text).toBe('recover me')
  expect(result.stored.closed[0].closedAt).toBe(122)
  expect(result.persisted).toEqual(result.stored)
})

test('commits reject selections that do not fit the stored text and leave the workspace intact', async ({ page }) => {
  await page.goto('./')
  const result = await page.evaluate(async (source) => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    const { openWorkspaceStore } = await import(url)
    URL.revokeObjectURL(url)
    const store = await openWorkspaceStore()
    const id = crypto.randomUUID()
    const meta = { id: 'one', section: 'open', sequence: 1, languageMode: 'auto', selection: { anchor: 0, head: 0 }, scrollTop: 0 }
    await store.commit({ id, activeId: 'one', updatedAt: 1, documents: [meta], texts: [{ id: 'one', text: 'abc' }], remove: [] }, 0)
    let rejectedInline = false
    let rejectedStored = false
    try { await store.commit({ id, activeId: 'one', updatedAt: 2, documents: [{ ...meta, selection: { anchor: 0, head: 9 } }], texts: [{ id: 'one', text: 'abc' }], remove: [] }, 1) } catch { rejectedInline = true }
    try { await store.commit({ id, activeId: 'one', updatedAt: 3, documents: [{ ...meta, selection: { anchor: 0, head: 9 } }], texts: [], remove: [] }, 1) } catch { rejectedStored = true }
    const loaded = await store.load(id)
    store.close()
    return { rejectedInline, rejectedStored, revision: loaded?.revision, text: loaded?.documents[0].text }
  }, await moduleSource())
  expect(result.rejectedInline).toBe(true)
  expect(result.rejectedStored).toBe(true)
  expect(result.revision).toBe(1)
  expect(result.text).toBe('abc')
})

test('saving commits does not retain caller-owned mutable objects', async ({ page }) => {
  await page.goto('./')
  const result = await page.evaluate(async (source) => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    const { openWorkspaceStore } = await import(url)
    URL.revokeObjectURL(url)
    const store = await openWorkspaceStore()
    const id = crypto.randomUUID()
    const meta = { id: 'one', section: 'open', sequence: 1, languageMode: 'auto', selection: { anchor: 0, head: 0 }, scrollTop: 0 }
    const change = { id, activeId: 'one', updatedAt: 1, documents: [meta], texts: [{ id: 'one', text: 'before' }], remove: [] }
    const saving = store.commit(change, 0)
    change.texts[0].text = 'after'
    change.documents[0].selection.head = 4
    await saving
    const stored = await store.load(id)
    store.close()
    return stored
  }, await moduleSource())
  expect(result?.documents[0].text).toBe('before')
  expect(result?.documents[0].selection.head).toBe(0)
})

test('corrupt workspace rows fail reads and cannot be silently overwritten', async ({ page }) => {
  await page.goto('./')
  const result = await page.evaluate(async (source) => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    const { openWorkspaceStore } = await import(url)
    URL.revokeObjectURL(url)
    const store = await openWorkspaceStore()
    const id = crypto.randomUUID()
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('sumi:workspaces', 2)
      request.onsuccess = () => resolve(request.result)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('workspaces', 'readwrite')
      transaction.objectStore('workspaces').put({ id, retainedText: 'do not delete' })
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
    })
    let readFailed = false
    let writeFailed = false
    try { await store.list() } catch { readFailed = true }
    try { await store.commit({ id, activeId: '', updatedAt: 1, documents: [], texts: [], remove: [] }, 0) } catch { writeFailed = true }
    const retained = await new Promise<unknown>((resolve) => {
      const request = database.transaction('workspaces', 'readonly').objectStore('workspaces').get(id)
      request.onsuccess = () => resolve(request.result)
    })
    store.close(); database.close()
    return { readFailed, writeFailed, retained }
  }, await moduleSource())
  expect(result.readFailed).toBe(true)
  expect(result.writeFailed).toBe(true)
  expect(result.retained).toMatchObject({ retainedText: 'do not delete' })
})

test('version 1 workspaces migrate into document and text rows without losing drafts', async ({ page }) => {
  await page.goto('./')
  await saved(page)
  await editor(page).fill('first legacy draft')
  await saved(page)
  // Replace the version 2 database with the version 1 shape this app used to write.
  await page.evaluate(async () => {
    const id = sessionStorage.getItem('sumi:workspace')!
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('sumi:workspaces')
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('Database deletion was blocked.'))
    })
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sumi:workspaces', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('workspaces', { keyPath: 'id' })
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('workspaces', 'readwrite')
      transaction.objectStore('workspaces').put({
        id, revision: 4, activeId: 'legacy-open', updatedAt: 10,
        documents: [
          { id: 'legacy-open', text: 'legacy draft from version one', languageMode: 'auto', selection: { anchor: 0, head: 0 }, scrollTop: 0 },
          { id: 'legacy-second', text: 'second legacy draft', languageMode: 'plain', selection: { anchor: 0, head: 0 }, scrollTop: 0 },
        ],
        closed: [{ id: 'legacy-closed', text: 'recover legacy', languageMode: 'auto', selection: { anchor: 0, head: 0 }, scrollTop: 0, closedAt: 9 }],
      })
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error)
    })
    database.close()
  })
  await page.reload()
  await saved(page)
  await expect(page.getByRole('tab')).toHaveCount(2)
  await expect(editor(page)).toHaveText('legacy draft from version one')
  await page.getByRole('tab', { name: 'second legacy draft' }).click()
  await expect(editor(page)).toHaveText('second legacy draft')
  await page.getByRole('button', { name: 'Recently closed', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('recover legacy')).toBeVisible()
  const version = await page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open('sumi:workspaces')
    request.onsuccess = () => { const { version } = request.result; request.result.close(); resolve(version) }
    request.onerror = () => reject(request.error)
  }))
  expect(version).toBe(2)
})
