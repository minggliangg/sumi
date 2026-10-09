import type { LanguageMode } from '../editor/languages.ts'

export interface StoredDocument {
  id: string
  text: string
  languageMode: LanguageMode
  selection: { anchor: number; head: number }
  scrollTop: number
  filename?: string
  closedAt?: number
  // Tab order for open documents. Kept stable across saves by the recovery layer.
  sequence?: number
}

export interface StoredWorkspace {
  id: string
  revision: number
  documents: StoredDocument[]
  activeId: string
  closed: StoredDocument[]
  updatedAt: number
}

// Small row, rewritten for selection, scroll and tab changes. Text lives in its own row.
export interface DocumentMeta {
  id: string
  section: 'open' | 'closed'
  sequence: number
  languageMode: LanguageMode
  selection: { anchor: number; head: number }
  scrollTop: number
  filename?: string
  closedAt?: number
}

// One atomic commit. Only the rows listed here are written.
export interface WorkspaceChange {
  id: string
  activeId: string
  updatedAt: number
  documents: DocumentMeta[]
  texts: { id: string; text: string }[]
  remove: string[]
}

export interface WorkspaceSummary {
  id: string
  revision: number
  activeId: string
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
  list(): Promise<WorkspaceSummary[]>
  load(id: string): Promise<StoredWorkspace | undefined>
  commit(change: WorkspaceChange, expectedRevision: number): Promise<number>
  close(): void
}

const DATABASE = 'sumi:workspaces'
// Version 2 splits each workspace into a summary row, document metadata rows and text rows.
const VERSION = 2
const WORKSPACES = 'workspaces'
const DOCUMENTS = 'documents'
const TEXTS = 'texts'
const LANGUAGE_MODES: readonly string[] = ['auto', 'plain', 'javascript', 'typescript', 'jsx', 'tsx', 'python', 'json', 'html', 'css', 'markdown', 'sql']

function corrupt() {
  return new Error('Saved workspace data is invalid. It has not been replaced.')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isOffset(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isLanguageMode(value: unknown): value is LanguageMode {
  return typeof value === 'string' && LANGUAGE_MODES.includes(value)
}

function validSelection(value: unknown, length?: number): value is { anchor: number; head: number } {
  if (!isRecord(value) || !isOffset(value.anchor) || !isOffset(value.head)) return false
  return length === undefined || (value.anchor <= length && value.head <= length)
}

function validScroll(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function validMeta(value: unknown): value is DocumentMeta {
  return isRecord(value) && typeof value.id === 'string'
    && (value.section === 'open' || value.section === 'closed')
    && isOffset(value.sequence) && isLanguageMode(value.languageMode)
    && validSelection(value.selection) && validScroll(value.scrollTop)
    && (value.filename === undefined || typeof value.filename === 'string')
    && (value.closedAt === undefined || Number.isFinite(value.closedAt))
}

function validText(value: unknown): value is { id: string; text: string } {
  return isRecord(value) && typeof value.id === 'string' && typeof value.text === 'string'
}

function validSummary(value: unknown): value is WorkspaceSummary {
  return isRecord(value) && typeof value.id === 'string' && isOffset(value.revision)
    && typeof value.activeId === 'string' && Number.isFinite(value.updatedAt)
}

// Version 1 rows embedded their documents. Validated before migration so corrupt data aborts the upgrade.
function validLegacyDocument(value: unknown): value is StoredDocument {
  return isRecord(value) && typeof value.id === 'string' && typeof value.text === 'string'
    && isLanguageMode(value.languageMode) && validSelection(value.selection, value.text.length)
    && validScroll(value.scrollTop)
    && (value.filename === undefined || typeof value.filename === 'string')
    && (value.closedAt === undefined || Number.isFinite(value.closedAt))
}

// Joins one workspace's rows. A single read transaction keeps the three stores consistent.
function assemble(row: unknown, metas: unknown[], texts: unknown[]): StoredWorkspace | undefined {
  if (row === undefined) {
    if (metas.length || texts.length) throw corrupt()
    return undefined
  }
  if (!validSummary(row)) throw corrupt()
  const bodies = new Map<string, string>()
  for (const value of texts) {
    if (!validText(value)) throw corrupt()
    bodies.set(value.id, value.text)
  }
  if (bodies.size !== texts.length) throw corrupt()
  const open: StoredDocument[] = []
  const closed: StoredDocument[] = []
  for (const value of metas) {
    if (!validMeta(value)) throw corrupt()
    const text = bodies.get(value.id)
    if (text === undefined || !validSelection(value.selection, text.length)) throw corrupt()
    bodies.delete(value.id)
    const { section, ...stored } = value
    const document: StoredDocument = { ...stored, text }
    ;(section === 'open' ? open : closed).push(document)
  }
  if (bodies.size) throw corrupt()
  open.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
  closed.sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))
  return { id: row.id, revision: row.revision, documents: open, activeId: row.activeId, closed, updatedAt: row.updatedAt }
}

function validChange(value: WorkspaceChange) {
  return typeof value.id === 'string' && typeof value.activeId === 'string' && Number.isFinite(value.updatedAt)
    && value.documents.every(validMeta)
    && value.texts.every(validText)
    && value.remove.every(id => typeof id === 'string')
}

function createStores(database: IDBDatabase) {
  database.createObjectStore(DOCUMENTS, { keyPath: ['workspaceId', 'id'] })
  database.createObjectStore(TEXTS, { keyPath: ['workspaceId', 'id'] })
}

interface LegacyWorkspace extends WorkspaceSummary {
  documents: StoredDocument[]
  closed: StoredDocument[]
}

function validLegacyWorkspace(value: unknown): value is LegacyWorkspace {
  return validSummary(value) && isRecord(value) && Array.isArray(value.documents) && Array.isArray(value.closed)
    && value.documents.every(validLegacyDocument) && value.closed.every(validLegacyDocument)
}

// Splits each version 1 workspace into rows. A throw aborts the upgrade, so the
// original database stays as it was and nothing is silently discarded.
function migrateLegacy(transaction: IDBTransaction) {
  const workspaces = transaction.objectStore(WORKSPACES)
  const documents = transaction.objectStore(DOCUMENTS)
  const texts = transaction.objectStore(TEXTS)
  const request = workspaces.getAll()
  request.onsuccess = () => {
    try {
      for (const row of request.result as unknown[]) {
        if (!validLegacyWorkspace(row)) throw corrupt()
        workspaces.put({ id: row.id, revision: row.revision, activeId: row.activeId, updatedAt: row.updatedAt })
        const write = (document: StoredDocument, section: DocumentMeta['section'], sequence: number) => {
          const { text, ...meta } = document
          documents.put({ ...meta, section, sequence, workspaceId: row.id })
          texts.put({ workspaceId: row.id, id: document.id, text })
        }
        row.documents.forEach((document, index) => write(document, 'open', index + 1))
        row.closed.forEach((document, index) => write(document, 'closed', row.documents.length + index + 1))
      }
    } catch {
      transaction.abort()
    }
  }
}

export async function openWorkspaceStore(): Promise<WorkspaceStore> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION)
    let settled = false
    request.onupgradeneeded = (event) => {
      if (settled) { request.transaction?.abort(); return }
      const upgrade = request.transaction!
      if (event.oldVersion < 1) request.result.createObjectStore(WORKSPACES, { keyPath: 'id' })
      if (event.oldVersion < 2) {
        createStores(request.result)
        if (event.oldVersion === 1) migrateLegacy(upgrade)
      }
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
      return new Promise<WorkspaceSummary[]>((resolve, reject) => {
        const transaction = database.transaction(WORKSPACES, 'readonly')
        const request = transaction.objectStore(WORKSPACES).getAll()
        transaction.oncomplete = () => {
          const rows: unknown[] = request.result
          if (rows.every(validSummary)) resolve(rows)
          else reject(corrupt())
        }
        transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('Could not read saved workspaces.'))
        transaction.onerror = () => { /* onabort reports the complete transaction failure */ }
      })
    },
    load(id) {
      return new Promise<StoredWorkspace | undefined>((resolve, reject) => {
        const transaction = database.transaction([WORKSPACES, DOCUMENTS, TEXTS], 'readonly')
        const row = transaction.objectStore(WORKSPACES).get(id)
        // Compound keys are [workspaceId, documentId]; this range selects one workspace's rows.
        const range = IDBKeyRange.bound([id], [id, []])
        const metas = transaction.objectStore(DOCUMENTS).getAll(range)
        const texts = transaction.objectStore(TEXTS).getAll(range)
        transaction.oncomplete = () => {
          try { resolve(assemble(row.result, metas.result, texts.result)) }
          catch (error) { reject(error) }
        }
        transaction.onabort = () => reject(transaction.error ?? row.error ?? new Error('Could not read this workspace.'))
        transaction.onerror = () => { /* onabort reports the complete transaction failure */ }
      })
    },
    async commit(change, expectedRevision) {
      // Copy immediately: queued transactions must save the caller's values,
      // rather than later mutations to its arrays or selection objects.
      const copy = structuredClone(change)
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('Invalid workspace revision.')
      if (!validChange(copy)) throw new Error('Workspace change is invalid.')
      const incoming = new Map(copy.texts.map(entry => [entry.id, entry.text]))
      for (const meta of copy.documents) {
        const text = incoming.get(meta.id)
        if (text !== undefined && !validSelection(meta.selection, text.length)) throw corrupt()
      }
      return new Promise<number>((resolve, reject) => {
        const transaction = database.transaction([WORKSPACES, DOCUMENTS, TEXTS], 'readwrite')
        const workspaces = transaction.objectStore(WORKSPACES)
        const documents = transaction.objectStore(DOCUMENTS)
        const texts = transaction.objectStore(TEXTS)
        let failure: Error | undefined
        let revision = expectedRevision + 1
        const fail = (error: Error) => {
          failure ??= error
          transaction.abort()
        }
        const write = () => {
          workspaces.put({ id: copy.id, revision, activeId: copy.activeId, updatedAt: copy.updatedAt })
          for (const meta of copy.documents) documents.put({ ...meta, workspaceId: copy.id })
          for (const entry of copy.texts) texts.put({ workspaceId: copy.id, id: entry.id, text: entry.text })
          for (const id of copy.remove) {
            documents.delete([copy.id, id])
            texts.delete([copy.id, id])
          }
        }
        const request = workspaces.get(copy.id)
        request.onsuccess = () => {
          const current: unknown = request.result
          if (current !== undefined && !validSummary(current)) return fail(corrupt())
          const actual = (current as WorkspaceSummary | undefined)?.revision ?? 0
          if (actual !== expectedRevision) return fail(new ConflictError(expectedRevision, actual))
          revision = actual + 1
          // Metadata for a document whose text is already stored must still fit that text.
          const unchecked = copy.documents.filter(meta => !incoming.has(meta.id))
          let pending = unchecked.length
          if (!pending) return write()
          for (const meta of unchecked) {
            const check = texts.get([copy.id, meta.id])
            check.onsuccess = () => {
              const row: unknown = check.result
              if (failure) return
              if (!validText(row) || !validSelection(meta.selection, row.text.length)) return fail(corrupt())
              if (--pending === 0) write()
            }
          }
        }
        transaction.oncomplete = () => resolve(revision)
        transaction.onabort = () => reject(failure ?? transaction.error ?? request.error ?? new Error('Could not save this workspace.'))
        transaction.onerror = () => { /* onabort also handles put and quota failures */ }
      })
    },
    close() { database.close() },
  }
}
