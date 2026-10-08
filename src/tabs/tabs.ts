import { createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import type { EditorState, StateEffect } from '@codemirror/state'
import { createEditorState } from '../editor/setup.ts'

export interface Tab {
  id: string
  title: string
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
  return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1)}…` : title
}

export function createTabs() {
  const [tabs, setTabs] = createStore<Tab[]>([])
  const [activeId, setActiveId] = createSignal('')
  const sessions = new Map<string, TabSession>()
  let counter = 0

  function open(doc = '') {
    const id = `tab-${++counter}`
    sessions.set(id, { state: createEditorState(doc) })
    setTabs(tabs.length, { id, title: titleFor(doc.split('\n', 1)[0]) })
    setActiveId(id)
    return id
  }

  function close(id: string) {
    const index = tabs.findIndex((t) => t.id === id)
    if (index === -1) return
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
    if (sessions.has(id)) sessions.set(id, value)
  }

  open()

  return { tabs, activeId, open, close, select, selectIndex, cycle, setTitle, session, saveSession }
}

export type Tabs = ReturnType<typeof createTabs>
