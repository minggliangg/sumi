import { createSignal, onCleanup } from 'solid-js'
import { createStore } from 'solid-js/store'
import { Transaction as EditorTransaction, type EditorState, type StateEffect, type Transaction, type Extension } from '@codemirror/state'
import { isolateHistory } from '@codemirror/commands'
import { requestFormat, type FormatJob } from '../editor/formatting.ts'
import { createEditorState, languageCompartment } from '../editor/setup.ts'
import { detectLanguage, loadLanguage, MAX_HIGHLIGHT_BYTES, SAMPLE_BYTES, utf8Bytes, type LanguageId, type LanguageMode, type LanguageStatus } from '../editor/languages.ts'

export interface Tab {
  id: string
  title: string
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
  const sessions = new Map<string, TabSession>()
  let counter = 0
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

  function open(doc = '') {
    const id = `tab-${++counter}`
    sessions.set(id, { state: createEditorState(doc) })
    languageSessions.set(id, { bytes: utf8Bytes(doc), generation: 0 })
    setTabs(tabs.length, { id, title: titleFor(doc.split('\n', 1)[0]), languageMode: 'auto', resolvedLanguage: null, languageStatus: 'plain', formatStatus: 'idle', formatError: '' })
    if (doc) setLanguage(id, 'auto')
    setActiveId(id)
    return id
  }

  function close(id: string) {
    const index = tabs.findIndex((t) => t.id === id)
    if (index === -1) return
    const current = sessions.get(id)
    if (current && !beforeClose(current.state)) return
    cancelFormat(id)
    clearTimeout(languageSessions.get(id)?.timer)
    languageSessions.delete(id)
    sessions.delete(id)
    setTabs((list) => list.filter((t) => t.id !== id))
    // Always keep at least one tab open.
    if (tabs.length === 0) open()
    else if (activeId() === id) setActiveId(tabs[Math.min(index, tabs.length - 1)].id)
  }

  function select(id: string) {
    if (sessions.has(id)) setActiveId(id)
  }

  function selectIndex(index: number) {
    const tab = tabs[index]
    if (tab) setActiveId(tab.id)
  }

  function cycle(delta: number) {
    const index = tabs.findIndex((t) => t.id === activeId())
    selectIndex((index + delta + tabs.length) % tabs.length)
  }

  function setTitle(id: string, title: string) {
    const index = tabs.findIndex((t) => t.id === id)
    if (index !== -1) setTabs(index, 'title', title)
  }

  function session(id: string) {
    return sessions.get(id)
  }

  function saveSession(id: string, value: TabSession) {
    if (sessions.has(id)) sessions.set(id, { ...sessions.get(id)!, ...value })
  }

  function hasContent() {
    return Array.from(sessions.values()).some(({ state }) => state.doc.length > 0)
  }

  open()

  return { tabs, activeId, open, close, select, selectIndex, cycle, setTitle, session, saveSession, hasContent, setLanguage, retryLanguage, documentChanged, setLanguageEffectsHandler, formatDocument, setFormatHandler }
}

export type Tabs = ReturnType<typeof createTabs>
