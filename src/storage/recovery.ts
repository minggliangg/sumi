import { createSignal, onCleanup, onMount } from 'solid-js'
import type { Text as EditorText } from '@codemirror/state'
import type { createTabs, DocumentSnapshot, TabsSnapshot } from '../tabs/tabs.ts'
import { ConflictError, openWorkspaceStore, type DocumentMeta, type StoredDocument, type WorkspaceChange, type WorkspaceStore, type StoredWorkspace } from './workspace.ts'

const SESSION_KEY = 'sumi:workspace'

// What the store last confirmed for one document. A missing field means it is not stored yet.
interface Baseline {
  meta?: string
  content?: EditorText
}

interface Described {
  id: string
  meta: DocumentMeta
  key: string
  content: EditorText
}

type Section = DocumentMeta['section']

function toStored({ content, ...document }: DocumentSnapshot): StoredDocument {
  return { ...document, text: content.toString() }
}

export function createRecovery(tabs: ReturnType<typeof createTabs>) {
  const [ready, setReady] = createSignal(false)
  const [storageStatus, setStatus] = createSignal<'loading' | 'saving' | 'saved' | 'error'>('loading')
  const [storageError, setError] = createSignal('')
  const [storageEstimate, setEstimate] = createSignal<{ usage: number; quota: number }>()
  let store: WorkspaceStore | undefined
  let workspaceId = ''
  let revision = 0
  let release: (() => void) | undefined
  let disposed = false
  let initialized = false
  let dirty = 0
  let committed = -1
  let timer: ReturnType<typeof setTimeout> | undefined
  let saving: Promise<void> | undefined
  let initializing: Promise<void> | undefined
  let conflictPending = false
  let baseline = new Map<string, Baseline>()
  let committedActive = ''
  // Tab order for open documents. A document keeps its sequence while it stays in the same section.
  const sequences = new Map<string, { section: Section; sequence: number }>()
  let lastSequence = 0

  function report(error: unknown) {
    setStatus('error')
    if (error instanceof ConflictError) conflictPending = true
    const message = error instanceof Error ? error.message : 'Drafts could not be saved. Export a copy and retry.'
    setError(error instanceof ConflictError ? 'Another window saved this workspace. Retry saving will preserve your drafts in a separate workspace.' : message)
  }
  async function claim(id: string, wait = false): Promise<(() => void) | null> {
    if (!navigator.locks) return () => undefined
    return new Promise(resolve => {
      const abort = new AbortController()
      const timeout = wait ? setTimeout(() => abort.abort(), 1500) : undefined
      void navigator.locks.request(`sumi:workspace:${id}`, wait ? { signal: abort.signal } : { ifAvailable: true }, async lock => {
        clearTimeout(timeout)
        if (!lock || disposed) { resolve(null); return }
        await new Promise<void>(unlock => { resolve(unlock) })
      }).catch(() => { clearTimeout(timeout); resolve(null) })
    })
  }
  function changed() {
    dirty++
    if (!initialized || disposed) return
    if (storageStatus() !== 'error') setStatus('saving')
    clearTimeout(timer)
    if (storageStatus() !== 'error') timer = setTimeout(() => { void flush().catch(() => undefined) }, 300)
  }
  function sequenceFor(id: string, section: Section) {
    const current = sequences.get(id)
    if (current?.section === section) return current.sequence
    const sequence = ++lastSequence
    sequences.set(id, { section, sequence })
    return sequence
  }
  function remember(document: StoredDocument, section: Section) {
    const sequence = document.sequence ?? 0
    sequences.set(document.id, { section, sequence })
    lastSequence = Math.max(lastSequence, sequence)
  }
  function describeOne(document: DocumentSnapshot, section: Section): Described {
    const meta: DocumentMeta = {
      id: document.id, section, sequence: sequenceFor(document.id, section), languageMode: document.languageMode,
      selection: document.selection, scrollTop: document.scrollTop, filename: document.filename, closedAt: document.closedAt,
    }
    return { id: document.id, meta, key: JSON.stringify(meta), content: document.content }
  }
  function describe(local: TabsSnapshot): Described[] {
    const described = [
      ...local.documents.map(document => describeOne(document, 'open')),
      ...local.closed.map(document => describeOne(document, 'closed')),
    ]
    const present = new Set(described.map(entry => entry.id))
    for (const id of sequences.keys()) if (!present.has(id)) sequences.delete(id)
    return described
  }
  // Only rows that differ from the store are written. Text is compared by
  // identity, so a tab switch or scroll never rewrites document text.
  function planChange(): { write?: WorkspaceChange; next: Map<string, Baseline>; active: string } {
    const local = tabs.snapshot()
    const described = describe(local)
    const present = new Set(described.map(entry => entry.id))
    const remove = [...baseline.keys()].filter(id => !present.has(id))
    const documents: DocumentMeta[] = []
    const texts: { id: string; text: string }[] = []
    const next = new Map<string, Baseline>()
    for (const entry of described) {
      const previous = baseline.get(entry.id)
      if (previous?.meta !== entry.key) documents.push(entry.meta)
      if (previous?.content !== entry.content) texts.push({ id: entry.id, text: entry.content.toString() })
      next.set(entry.id, { meta: entry.key, content: entry.content })
    }
    const active = local.activeId
    if (!documents.length && !texts.length && !remove.length && active === committedActive) return { next, active }
    return { write: { id: workspaceId, activeId: active, updatedAt: Date.now(), documents, texts, remove }, next, active }
  }
  async function initialize() {
    if (initializing) return initializing
    initializing = (async () => {
      setStatus('loading'); setError('')
      try {
        store?.close()
        store = await openWorkspaceStore()
        const records = (await store.list()).sort((a, b) => b.updatedAt - a.updatedAt)
        if (disposed) { store.close(); return }
        let preferred = ''
        try { preferred = sessionStorage.getItem(SESSION_KEY) ?? '' } catch { /* session storage is optional */ }
        const candidates = [...records.filter(row => row.id === preferred), ...records.filter(row => row.id !== preferred)]
        let chosen: StoredWorkspace | undefined
        for (const record of candidates) {
          const unlock = await claim(record.id, record.id === preferred)
          if (unlock) {
            release = unlock
            // An earlier window may have committed while this claim waited.
            chosen = await store.load(record.id)
            if (chosen) break
            release(); release = undefined
          }
        }
        if (disposed) { release?.(); store.close(); return }
        workspaceId = chosen?.id ?? crypto.randomUUID()
        if (!release) release = await claim(workspaceId) ?? undefined
        revision = chosen?.revision ?? 0
        baseline = new Map()
        committedActive = ''
        // If storage was unavailable at launch, keep new text typed meanwhile
        // and append it to the recovered workspace rather than replacing it.
        const local = tabs.snapshot()
        if (chosen) {
          for (const document of chosen.documents) remember(document, 'open')
          for (const document of chosen.closed) remember(document, 'closed')
          const unsaved = local.documents.filter(document => document.content.length > 0 || document.filename || document.languageMode !== 'auto').map(toStored)
          tabs.restore({ documents: [...chosen.documents, ...unsaved], activeId: unsaved.length ? local.activeId : chosen.activeId, closed: [...local.closed.map(toStored), ...chosen.closed].filter((document, index, all) => all.findIndex(other => other.id === document.id) === index).sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)).slice(0, 20) })
          // Documents already in storage start clean, so launch writes nothing unless something differs.
          const stored = new Set([...chosen.documents, ...chosen.closed].map(document => document.id))
          const restored = describe(tabs.snapshot())
          const present = new Set(restored.map(entry => entry.id))
          for (const entry of restored) if (stored.has(entry.id)) baseline.set(entry.id, { meta: entry.key, content: entry.content })
          // Stored documents the restore dropped (older closed entries) are removed by the next save.
          for (const id of stored) if (!present.has(id)) baseline.set(id, {})
          committedActive = chosen.activeId
        }
        try { sessionStorage.setItem(SESSION_KEY, workspaceId) } catch { /* lock/CAS still protects writes */ }
        initialized = true
        conflictPending = false
        setReady(true)
        tabs.setChangeHandler(changed)
        changed()
        await flush()
        void navigator.storage?.persist?.().catch(() => undefined)
      } catch (error) {
        if (!initialized) {
          release?.()
          release = undefined
          store?.close()
          store = undefined
        }
        report(error)
        setReady(true)
      }
    })().finally(() => { initializing = undefined })
    return initializing
  }
  async function flush(): Promise<void> {
    clearTimeout(timer)
    if (!initialized || !store) throw new Error(storageError() || 'Workspace storage is not available.')
    if (saving) { await saving; if (dirty !== committed) return flush(); return }
    if (dirty === committed) return
    saving = (async () => {
      while (!disposed && dirty !== committed) {
        const version = dirty
        const plan = planChange()
        if (plan.write) {
          setStatus('saving')
          revision = await store!.commit(plan.write, revision)
        }
        baseline = plan.next
        committedActive = plan.active
        committed = version
      }
      if (!disposed) {
        setStatus('saved'); setError(''); conflictPending = false
        void navigator.storage?.estimate?.().then(estimate => {
          if (!disposed) setEstimate({ usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 })
        }).catch(() => undefined)
      }
    })().catch(error => { report(error); throw error }).finally(() => { saving = undefined })
    return saving
  }
  async function storageRetry() {
    if (!initialized) await initialize()
    else {
      setError(''); setStatus('saving')
      try {
        if (saving) {
          try { await saving }
          catch { /* the failed snapshot remains dirty and will be retried below */ }
        }
        store?.close()
        store = await openWorkspaceStore()
        if (conflictPending) {
          release?.()
          release = undefined
          const forkId = crypto.randomUUID()
          release = await claim(forkId) ?? undefined
          if (!release) throw new Error('Could not claim a new workspace for these drafts. Retry saving.')
          workspaceId = forkId
          revision = 0
          // The fork is a new workspace, so nothing is baselined and every document is written.
          baseline = new Map()
          committedActive = ''
          dirty++
          try { sessionStorage.setItem(SESSION_KEY, workspaceId) } catch { /* the new workspace is still saved locally */ }
          conflictPending = false
        }
        await flush()
      } catch (error) { report(error) }
    }
  }
  function hasUnsaved() {
    if (initialized) return dirty !== committed || storageStatus() === 'error'
    return tabs.hasContent() || tabs.closedTabs().length > 0 || tabs.tabs.some(tab => !!tab.filename || tab.languageMode !== 'auto')
  }
  function onVisibility() { if (document.visibilityState === 'hidden') void flush().catch(() => undefined) }
  function onPageHide() { void flush().catch(() => undefined) }
  onMount(() => {
    void initialize()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
  })
  onCleanup(() => {
    disposed = true
    clearTimeout(timer)
    tabs.setChangeHandler()
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onPageHide)
    release?.()
    if (saving) void saving.finally(() => store?.close()).catch(() => undefined)
    else store?.close()
  })
  return { ready, storageStatus, storageError, storageEstimate, storageRetry, flush, hasUnsaved }
}
