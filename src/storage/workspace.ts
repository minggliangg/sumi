import type { LanguageMode } from '../editor/languages.ts'

export interface StoredDocument {
  id: string
  text: string
  languageMode: LanguageMode
  selection: { anchor: number; head: number }
  scrollTop: number
  filename?: string
  closedAt?: number
}

export interface StoredWorkspace {
  id: string
  revision: number
  documents: StoredDocument[]
  activeId: string
  closed: StoredDocument[]
  updatedAt: number
}

export class ConflictError extends Error {
  readonly expectedRevision: number
  readonly actualRevision: number
  constructor(expectedRevision: number, actualRevision: number) {
    super('This workspace was changed by another window. Reload it before saving.')
    this.name = 'ConflictError'
    this.expectedRevision = expectedRevision
    this.actualRevision = actualRevision
  }
}

export interface WorkspaceStore {
  list(): Promise<StoredWorkspace[]>
  save(snapshot: StoredWorkspace, expectedRevision: number): Promise<number>
  close(): void
}

const DATABASE = 'sumi:workspaces'
const STORE = 'workspaces'

function assertWorkspace(value: unknown): asserts value is StoredWorkspace {
  const workspace = value as Partial<StoredWorkspace> | null
  const documentValid = (value: unknown) => {
    const document = value as Partial<StoredDocument> | null
    return document !== null && typeof document === 'object'
      && typeof document.id === 'string' && typeof document.text === 'string'
      && ['auto', 'plain', 'javascript', 'typescript', 'jsx', 'tsx', 'python', 'json', 'html', 'css', 'markdown', 'sql'].includes(document.languageMode ?? '')
      && !!document.selection && Number.isSafeInteger(document.selection.anchor) && Number.isSafeInteger(document.selection.head)
      && document.selection.anchor >= 0 && document.selection.anchor <= document.text.length
      && document.selection.head >= 0 && document.selection.head <= document.text.length
      && Number.isFinite(document.scrollTop) && (document.scrollTop ?? -1) >= 0
      && (document.filename === undefined || typeof document.filename === 'string')
      && (document.closedAt === undefined || Number.isFinite(document.closedAt))
  }
  if (!workspace || typeof workspace !== 'object' || typeof workspace.id !== 'string'
    || !Number.isSafeInteger(workspace.revision) || (workspace.revision ?? -1) < 0
    || typeof workspace.activeId !== 'string' || !Number.isFinite(workspace.updatedAt)
    || !Array.isArray(workspace.documents) || !workspace.documents.every(documentValid)
    || !Array.isArray(workspace.closed) || !workspace.closed.every(documentValid)) {
    throw new Error('Saved workspace data is invalid. It has not been replaced.')
  }
}

export async function openWorkspaceStore(): Promise<WorkspaceStore> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    let settled = false
    request.onupgradeneeded = () => {
      if (settled) { request.transaction?.abort(); return }
      request.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => {
      if (settled) { request.result.close(); return }
      settled = true
      resolve(request.result)
    }
    request.onerror = () => { settled = true; reject(request.error ?? new Error('Could not open workspace storage.')) }
    request.onblocked = () => { settled = true; reject(new Error('Workspace storage is blocked by another window. Close it and retry.')) }
  })
  database.onversionchange = () => database.close()

  return {
    list() {
      return new Promise<StoredWorkspace[]>((resolve, reject) => {
        const transaction = database.transaction(STORE, 'readonly')
        const request = transaction.objectStore(STORE).getAll()
        transaction.oncomplete = () => {
          try {
            const snapshots: unknown[] = request.result
            snapshots.forEach(assertWorkspace)
            resolve(snapshots as StoredWorkspace[])
          } catch (error) { reject(error) }
        }
        transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('Could not read saved workspaces.'))
        transaction.onerror = () => { /* onabort reports the complete transaction failure */ }
      })
    },
    async save(snapshot, expectedRevision) {
      // Copy immediately: queued transactions must save the caller's snapshot,
      // rather than later mutations to its arrays or selection objects.
      const copy = structuredClone(snapshot)
      assertWorkspace(copy)
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('Invalid workspace revision.')
      return new Promise<number>((resolve, reject) => {
        const transaction = database.transaction(STORE, 'readwrite')
        const store = transaction.objectStore(STORE)
        const request = store.get(copy.id)
        let failure: Error | undefined
        let revision = expectedRevision + 1
        request.onsuccess = () => {
          const current = request.result as StoredWorkspace | undefined
          if (current) {
            try { assertWorkspace(current) } catch (error) {
              failure = error instanceof Error ? error : new Error('Invalid saved workspace.')
              transaction.abort()
              return
            }
          }
          const actual = current?.revision ?? 0
          if (actual !== expectedRevision) {
            failure = new ConflictError(expectedRevision, actual)
            transaction.abort()
            return
          }
          revision = actual + 1
          store.put({ ...copy, revision })
        }
        transaction.oncomplete = () => resolve(revision)
        transaction.onabort = () => reject(failure ?? transaction.error ?? request.error ?? new Error('Could not save this workspace.'))
        transaction.onerror = () => { /* onabort also handles put and quota failures */ }
      })
    },
    close() { database.close() },
  }
}
