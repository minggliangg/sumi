import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { expect, test } from '@playwright/test'

// Exercise the actual storage module against native Chromium IndexedDB without
// adding a test-only export or a database emulation dependency to the app.
async function moduleSource() {
  const source = await readFile('src/storage/workspace.ts', 'utf8')
  return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
}

test('workspace saves commit complete snapshots and reject competing revisions', async ({ page }) => {
  await page.goto('./')
  const result = await page.evaluate(async (source) => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    const { openWorkspaceStore, ConflictError } = await import(url)
    URL.revokeObjectURL(url)
    const first = await openWorkspaceStore()
    const second = await openWorkspaceStore()
    const snapshot = {
      id: crypto.randomUUID(), revision: 0, activeId: 'one', updatedAt: 123,
      documents: [{ id: 'one', text: 'draft 📝', languageMode: 'python', selection: { anchor: 2, head: 7 }, scrollTop: 42, filename: 'draft.py' }],
      closed: [{ id: 'closed', text: 'recover me', languageMode: 'plain', selection: { anchor: 0, head: 0 }, scrollTop: 0, closedAt: 122 }],
    }
    const initial = await first.save(snapshot, 0)
    const outcomes = await Promise.allSettled([
      first.save({ ...snapshot, documents: [{ ...snapshot.documents[0], text: 'first writer' }] }, 1),
      second.save({ ...snapshot, documents: [{ ...snapshot.documents[0], text: 'second writer' }] }, 1),
    ])
    const failure = outcomes.find(outcome => outcome.status === 'rejected') as PromiseRejectedResult
    const stored = (await second.list()).find((workspace: { id: string }) => workspace.id === snapshot.id)
    first.close(); second.close()
    const reopened = await openWorkspaceStore()
    const persisted = (await reopened.list()).find((workspace: { id: string }) => workspace.id === snapshot.id)
    reopened.close()
    return {
      initial, successful: outcomes.filter(outcome => outcome.status === 'fulfilled').length,
      conflict: failure.reason instanceof ConflictError,
      expected: failure.reason.expectedRevision, actual: failure.reason.actualRevision,
      stored, persisted,
    }
  }, await moduleSource())
  expect(result.initial).toBe(1)
  expect(result.successful).toBe(1)
  expect(result.conflict).toBe(true)
  expect(result.expected).toBe(1)
  expect(result.actual).toBe(2)
  expect(result.stored.revision).toBe(2)
  expect(['first writer', 'second writer']).toContain(result.stored.documents[0].text)
  expect(result.stored.documents[0].selection).toEqual({ anchor: 2, head: 7 })
  expect(result.stored.documents[0].scrollTop).toBe(42)
  expect(result.stored.documents[0].filename).toBe('draft.py')
  expect(result.stored.closed[0].text).toBe('recover me')
  expect(result.stored.closed[0].closedAt).toBe(122)
  expect(result.persisted).toEqual(result.stored)
})

test('saving snapshots does not retain caller-owned mutable objects', async ({ page }) => {
  await page.goto('./')
  const result = await page.evaluate(async (source) => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
    const { openWorkspaceStore } = await import(url)
    URL.revokeObjectURL(url)
    const store = await openWorkspaceStore()
    const snapshot = { id: crypto.randomUUID(), revision: 0, activeId: 'one', updatedAt: 1, closed: [], documents: [{ id: 'one', text: 'before', languageMode: 'auto', selection: { anchor: 0, head: 0 }, scrollTop: 0 }] }
    const saving = store.save(snapshot, 0)
    snapshot.documents[0].text = 'after'
    snapshot.documents[0].selection.head = 4
    await saving
    const stored = (await store.list()).find((workspace: { id: string }) => workspace.id === snapshot.id)
    store.close()
    return stored
  }, await moduleSource())
  expect(result.documents[0].text).toBe('before')
  expect(result.documents[0].selection.head).toBe(0)
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
      const request = indexedDB.open('sumi:workspaces', 1)
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
    try { await store.save({ id, revision: 0, activeId: '', documents: [], closed: [], updatedAt: 1 }, 0) } catch { writeFailed = true }
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
