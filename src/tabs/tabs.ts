import type { StoredDocument, StoredWorkspace } from '../storage/workspace.ts'
import { batch, createSignal, onCleanup } from 'solid-js'
import { createStore } from 'solid-js/store'
import { Transaction as EditorTransaction, type EditorState, type StateEffect, type Text as EditorText, type Transaction, type Extension } from '@codemirror/state'
import { isolateHistory } from '@codemirror/commands'
import { requestFormat, type FormatJob } from '../editor/formatting.ts'
import { createEditorState, languageCompartment } from '../editor/setup.ts'
import { detectLanguage, loadLanguage, MAX_HIGHLIGHT_BYTES, SAMPLE_BYTES, utf8Bytes, type LanguageId, type LanguageMode, type LanguageStatus } from '../editor/languages.ts'

export interface Tab {
  id: string
  title: string
  filename?: string
  languageMode: LanguageMode
  resolvedLanguage: LanguageId | null
  languageStatus: LanguageStatus
  formatStatus: 'idle' | 'formatting' | 'error'
  formatError: string
}

// Editor state lives outside the reactive store: it is large, immutable,
// and only needs to be read when a tab becomes active.
interface TabSession {
  state: EditorState
  scroll?: StateEffect<unknown>
  scrollTop?: number
}

// What recovery persists for one document. Content is an immutable CodeMirror
// document, so an unchanged document keeps the same object and is never re-serialized.
export interface DocumentSnapshot {
  id: string
  content: EditorText
  languageMode: LanguageMode
  selection: { anchor: number; head: number }
  scrollTop: number
  filename?: string
  closedAt?: number
}

export interface TabsSnapshot {
  documents: DocumentSnapshot[]
  activeId: string
  closed: DocumentSnapshot[]
}

function documentFromStored({ text, ...document }: StoredDocument): DocumentSnapshot {
  return { ...document, content: createEditorState(text).doc }
}


const UNTITLED = 'untitled'
const MAX_TITLE = 28

export function titleFor(firstLine: string): string {
  const title = firstLine.trim().replace(/^#+\s*/, '')
  if (!title) return UNTITLED
  const characters = Array.from(title)
  return characters.length > MAX_TITLE ? `${characters.slice(0, MAX_TITLE - 1).join('')}…` : title
}

export function createTabs(beforeClose: (state: EditorState) => boolean = () => true) {
  const [tabs, setTabs] = createStore<Tab[]>([])
  const [activeId, setActiveId] = createSignal('')
  const [workspaceVersion, setWorkspaceVersion] = createSignal(0)
  const sessions = new Map<string, TabSession>()
  const [closedTabs, setClosedTabs] = createSignal<{ id: string; title: string; closedAt: number }[]>([])
  const closedDocuments = new Map<string, DocumentSnapshot>()
  let onChange: (() => void) | undefined
  const changed = () => onChange?.()
  function setChangeHandler(handler?: () => void) { onChange = handler }
  let disposed = false
  const languageSessions = new Map<string, { bytes: number; generation: number; timer?: ReturnType<typeof setTimeout> }>()
  const formatJobs = new Map<string, FormatJob>()
  let applyFormatToView: ((id: string, transaction: Transaction) => boolean) | undefined
  let applyToView: ((id: string, effects: StateEffect<unknown>) => boolean) | undefined

  function metadata(id: string, values: Partial<Tab>) {
    const index = tabs.findIndex(tab => tab.id === id)
    if (index !== -1) setTabs(index, values)
  }

  function cancelFormat(id: string, message = '') {
    const job = formatJobs.get(id)
    if (!job) return
    formatJobs.delete(id)
    job.cancel()
    metadata(id, { formatStatus: message ? 'error' : 'idle', formatError: message })
  }

  async function formatDocument(id: string) {
    const tab = tabs.find(tab => tab.id === id)
    const current = sessions.get(id)
    if (!tab || !current || formatJobs.has(id) || !tab.resolvedLanguage || tab.languageMode === 'plain' || tab.languageStatus === 'large') return
    if (!current.state.doc.length) { metadata(id, { formatStatus: 'idle', formatError: '' }); return }
    const original = current.state.doc
    const mode = tab.languageMode
    const language = tab.resolvedLanguage
    const job = requestFormat(language, original.toString())
    formatJobs.set(id, job)
    metadata(id, { formatStatus: 'formatting', formatError: '' })
    try {
      const changes = await job.promise
      if (disposed || formatJobs.get(id) !== job) return
      formatJobs.delete(id)
      const session = sessions.get(id)
      if (!session || session.state.doc !== original || tab.languageMode !== mode || tab.resolvedLanguage !== language) {
        metadata(id, { formatStatus: 'error', formatError: 'Document changed. Format again.' })
        return
      }
      if (changes.length) {
        const transaction = session.state.update({ changes, annotations: [isolateHistory.of('full'), EditorTransaction.userEvent.of('input.format')] })
        if (!applyFormatToView?.(id, transaction)) {
          session.state = transaction.state
          // Stored scroll anchors reference the previous document. Map them
          // through the same change set before this inactive tab is restored.
          if (session.scroll) session.scroll = session.scroll.map(transaction.changes) ?? undefined
          setTitle(id, titleFor(transaction.state.doc.line(1).text))
          documentChanged(id, [transaction])
        }
      }
      metadata(id, { formatStatus: 'idle', formatError: '' })
    } catch (error) {
      if (disposed || formatJobs.get(id) !== job) return
      formatJobs.delete(id)
      const message = error instanceof Error ? error.message : 'Formatting failed.'
      metadata(id, { formatStatus: 'error', formatError: message.length > 240 ? message.slice(0, 240) + '…' : message })
    }
  }

  function cancelFormatting() { for (const id of formatJobs.keys()) cancelFormat(id) }

  function setFormatHandler(handler?: typeof applyFormatToView) { applyFormatToView = handler }

  function configure(id: string, extension: Extension) {
    const current = sessions.get(id)
    if (!current) return
    const effect = languageCompartment.reconfigure(extension)
    if (!applyToView?.(id, effect)) current.state = current.state.update({ effects: effect }).state
  }

  function resolveLanguage(id: string, language: LanguageId | null) {
    const current = languageSessions.get(id)
    if (!current || disposed) return
    const generation = ++current.generation
    configure(id, [])
    metadata(id, { resolvedLanguage: language, languageStatus: language ? 'loading' : 'plain' })
    if (!language) return
    void loadLanguage(language).then(extension => {
      if (disposed || languageSessions.get(id) !== current || current.generation !== generation) return
      configure(id, extension)
      metadata(id, { languageStatus: 'ready' })
    }, () => {
      if (disposed || languageSessions.get(id) !== current || current.generation !== generation) return
      metadata(id, { languageStatus: 'error' })
    })
  }

  function detect(id: string) {
    const tab = tabs.find(tab => tab.id === id)
    const current = languageSessions.get(id)
    if (!tab || !current || tab.languageMode !== 'auto' || tab.resolvedLanguage || current.bytes > MAX_HIGHLIGHT_BYTES) return
    const doc = sessions.get(id)!.state.doc
    const result = detectLanguage(doc.sliceString(0, Math.min(doc.length, SAMPLE_BYTES)))
    if (result) resolveLanguage(id, result)
  }

  function setLanguage(id: string, mode: LanguageMode) {
    const current = languageSessions.get(id)
    if (!current) return
    cancelFormat(id, 'Document changed. Format again.')
    clearTimeout(current.timer)
    metadata(id, { languageMode: mode })
    changed()
    if (current.bytes > MAX_HIGHLIGHT_BYTES) {
      ++current.generation
      configure(id, [])
      metadata(id, { resolvedLanguage: null, languageStatus: 'large' })
    } else {
      resolveLanguage(id, mode === 'auto' || mode === 'plain' ? null : mode)
      if (mode === 'auto') detect(id)
    }
  }

  function retryLanguage(id: string) {
    const tab = tabs.find(tab => tab.id === id)
    if (tab?.languageStatus === 'error') resolveLanguage(id, tab.resolvedLanguage)
  }

  function documentChanged(id: string, transactions: readonly Transaction[]) {
    const current = languageSessions.get(id)
    const tab = tabs.find(tab => tab.id === id)
    if (!current || !tab) return
    changed()
    cancelFormat(id, 'Document changed. Format again.')
    let fullPaste = false
    let recountBytes = false
    for (const tr of transactions) {
      if (!tr.docChanged) continue
      tr.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
        // A change may split a surrogate pair; isolated code units have different
        // UTF-8 sizes from the pair. Recount only those unusual boundary edits.
        const boundary = tr.startState.doc.sliceString(Math.max(0, from - 1), Math.min(tr.startState.doc.length, from + 1))
          + tr.startState.doc.sliceString(Math.max(0, to - 1), Math.min(tr.startState.doc.length, to + 1))
        if (/[\uD800-\uDFFF]/.test(boundary)) recountBytes = true
        current.bytes += utf8Bytes(inserted.toString()) - utf8Bytes(tr.startState.doc.sliceString(from, to))
        if (tr.isUserEvent('input.paste') && from === 0 && to === tr.startState.doc.length) fullPaste = true
      })
    }
    if (recountBytes) current.bytes = utf8Bytes(sessions.get(id)!.state.doc.toString())
    clearTimeout(current.timer)
    if (current.bytes > MAX_HIGHLIGHT_BYTES) {
      if (tab.languageStatus !== 'large') {
        ++current.generation
        configure(id, [])
        metadata(id, { resolvedLanguage: null, languageStatus: 'large' })
      }
      return
    }
    if (tab.languageStatus === 'large') setLanguage(id, tab.languageMode)
    if (tab.languageMode !== 'auto') return
    if (sessions.get(id)!.state.doc.length === 0 || fullPaste) resolveLanguage(id, null)
    if (!tab.resolvedLanguage) {
      if (transactions.some(tr => tr.isUserEvent('input.paste'))) detect(id)
      else current.timer = setTimeout(() => detect(id), 750)
    }
  }

  function setLanguageEffectsHandler(handler?: typeof applyToView) { applyToView = handler }

  onCleanup(() => {
    disposed = true
    for (const job of formatJobs.values()) job.cancel()
    formatJobs.clear()
    applyFormatToView = undefined
    for (const current of languageSessions.values()) clearTimeout(current.timer)
    applyToView = undefined
  })

  function open(doc = '', filename?: string, restored?: Pick<StoredDocument, 'id' | 'languageMode' | 'selection' | 'scrollTop'>) {
    const id = restored?.id ?? crypto.randomUUID()
    let state = createEditorState(doc)
    if (restored) state = state.update({ selection: restored.selection }).state
    sessions.set(id, { state, scrollTop: restored?.scrollTop ?? 0 })
    languageSessions.set(id, { bytes: utf8Bytes(doc), generation: 0 })
    setTabs(tabs.length, { id, filename, title: filename ?? titleFor(doc.split('\n', 1)[0]), languageMode: 'auto', resolvedLanguage: null, languageStatus: 'plain', formatStatus: 'idle', formatError: '' })
    if (restored || doc) setLanguage(id, restored?.languageMode ?? 'auto')
    setActiveId(id)
    changed()
    return id
  }

  function close(id: string) {
    const index = tabs.findIndex((t) => t.id === id)
    if (index === -1) return
    const current = sessions.get(id)
    if (current && !beforeClose(current.state)) return
    if (current && current.state.doc.length) {
      const closedAt = Date.now()
      const document = { ...documentSnapshot(id), closedAt }
      closedDocuments.set(id, document)
      const items = [{ id, title: tabs[index].title, closedAt }, ...closedTabs().filter(tab => tab.id !== id)].slice(0, 20)
      setClosedTabs(items)
      for (const key of closedDocuments.keys()) if (!items.some(tab => tab.id === key)) closedDocuments.delete(key)
    }
    cancelFormat(id)
    clearTimeout(languageSessions.get(id)?.timer)
    languageSessions.delete(id)
    sessions.delete(id)
    setTabs((list) => list.filter((t) => t.id !== id))
    // Always keep at least one tab open.
    if (tabs.length === 0) open()
    else if (activeId() === id) setActiveId(tabs[Math.min(index, tabs.length - 1)].id)
    changed()
  }

  function select(id: string) {
    if (sessions.has(id) && activeId() !== id) { setActiveId(id); changed() }
  }

  function selectIndex(index: number) {
    const tab = tabs[index]
    if (tab) select(tab.id)
  }

  function cycle(delta: number) {
    const index = tabs.findIndex((t) => t.id === activeId())
    selectIndex((index + delta + tabs.length) % tabs.length)
  }

  function setTitle(id: string, title: string) {
    const index = tabs.findIndex((t) => t.id === id)
    if (index !== -1 && !tabs[index].filename) setTabs(index, 'title', title)
  }

  function rename(id: string, name: string) {
    const index = tabs.findIndex(tab => tab.id === id)
    if (index === -1) return
    const filename = Array.from(name.trim()).slice(0, 120).join('') || undefined
    setTabs(index, { filename, title: filename ?? titleFor(sessions.get(id)!.state.doc.line(1).text) })
    changed()
  }

  function session(id: string) {
    return sessions.get(id)
  }

  function saveSession(id: string, value: TabSession) {
    const previous = sessions.get(id)
    if (!previous) return
    sessions.set(id, { ...previous, ...value })
    // Syntax/theme effects and runtime scroll anchors are not stored data.
    // Only document, selection or viewport changes need an autosave.
    if (previous.state.doc !== value.state.doc || !previous.state.selection.eq(value.state.selection)
      || (value.scrollTop !== undefined && previous.scrollTop !== value.scrollTop)) changed()
  }

  function hasContent() {
    return Array.from(sessions.values()).some(({ state }) => state.doc.length > 0)
  }

  function documentSnapshot(id: string): DocumentSnapshot {
    const current = sessions.get(id)!
    const tab = tabs.find(tab => tab.id === id)!
    return { id, content: current.state.doc, languageMode: tab.languageMode,
      selection: { anchor: current.state.selection.main.anchor, head: current.state.selection.main.head },
      scrollTop: current.scrollTop ?? 0, filename: tab.filename }
  }
  function snapshot(): TabsSnapshot {
    return { documents: tabs.map(tab => documentSnapshot(tab.id)), activeId: activeId(), closed: closedTabs().map(tab => closedDocuments.get(tab.id)!) }
  }
  function restore(snapshot: Pick<StoredWorkspace, 'documents' | 'activeId' | 'closed'>) {
    const handler = onChange
    onChange = undefined
    try {
      // Expose one final workspace to reactive consumers, not each temporary
      // active tab while the session map is being reconstructed.
      batch(() => {
        for (const job of formatJobs.values()) job.cancel()
        formatJobs.clear()
        for (const session of languageSessions.values()) clearTimeout(session.timer)
        languageSessions.clear(); sessions.clear(); closedDocuments.clear()
        setTabs([])
        for (const document of snapshot.documents) open(document.text, document.filename, document)
        if (!tabs.length) open()
        select(snapshot.activeId)
        for (const document of snapshot.closed.slice(0, 20)) closedDocuments.set(document.id, documentFromStored(document))
        setClosedTabs(snapshot.closed.slice(0, 20).map(document => ({ id: document.id, title: document.filename ?? titleFor(document.text.split('\n', 1)[0]!), closedAt: document.closedAt ?? Date.now() })))
        // A retry can preserve the same active ID while replacing its state.
        // The mounted view must still install the reconstructed EditorState.
        setWorkspaceVersion(workspaceVersion() + 1)
      })
    } finally { onChange = handler }
  }
  function recover(id: string) {
    const document = closedDocuments.get(id)
    if (!document) return
    deleteClosed(id)
    open(document.content.toString(), document.filename, document)
  }
  function deleteClosed(id: string) {
    closedDocuments.delete(id)
    setClosedTabs(closedTabs().filter(tab => tab.id !== id))
    changed()
  }
  function setScrollTop(id: string, value: number) {
    const current = sessions.get(id)
    if (current && current.scrollTop !== value) { current.scrollTop = value; changed() }
  }

  open()

  return { tabs, activeId, workspaceVersion, open, close, select, selectIndex, cycle, setTitle, session, saveSession, hasContent, setLanguage, retryLanguage, documentChanged, setLanguageEffectsHandler, formatDocument, setFormatHandler, cancelFormatting, snapshot, restore, rename, closedTabs, recover, deleteClosed, setScrollTop, setChangeHandler }
}

export type Tabs = ReturnType<typeof createTabs>
