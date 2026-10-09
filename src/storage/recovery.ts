import { createSignal, onCleanup, onMount } from 'solid-js'
import type { createTabs } from '../tabs/tabs.ts'
import { ConflictError, openWorkspaceStore, type WorkspaceStore, type StoredWorkspace } from './workspace.ts'

const SESSION_KEY = 'sumi:workspace'
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
            chosen = (await store.list()).find(row => row.id === record.id)
            if (chosen) break
            release(); release = undefined
          }
        }
        if (disposed) { release?.(); store.close(); return }
        workspaceId = chosen?.id ?? crypto.randomUUID()
        if (!release) release = await claim(workspaceId) ?? undefined
        revision = chosen?.revision ?? 0
        // If storage was unavailable at launch, keep new text typed meanwhile
        // and append it to the recovered workspace rather than replacing it.
        const local = tabs.snapshot()
        if (chosen) {
          const unsaved = local.documents.filter(document => document.text.length > 0 || document.filename || document.languageMode !== 'auto')
          tabs.restore({ documents: [...chosen.documents, ...unsaved], activeId: unsaved.length ? local.activeId : chosen.activeId, closed: [...local.closed, ...chosen.closed].filter((document, index, all) => all.findIndex(other => other.id === document.id) === index).sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)).slice(0, 20) })
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
        const data = tabs.snapshot()
        setStatus('saving')
        revision = await store!.save({ id: workspaceId, revision, ...data, updatedAt: Date.now() }, revision)
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
