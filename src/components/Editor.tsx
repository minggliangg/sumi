import { createEffect, on, onCleanup, onMount } from 'solid-js'
import { EditorView } from '@codemirror/view'
import type { EditorState } from '@codemirror/state'
import { titleFor, type Tabs } from '../tabs/tabs.ts'

export interface Cursor {
  line: number
  col: number
  selected: number
}

function cursorOf(state: EditorState): Cursor {
  const { head, from, to } = state.selection.main
  const line = state.doc.lineAt(head)
  return { line: line.number, col: head - line.from + 1, selected: to - from }
}

interface Props {
  tabs: Tabs
  onCursor: (cursor: Cursor) => void
}

export default function Editor(props: Props) {
  let host!: HTMLDivElement

  onMount(() => {
    const { tabs } = props

    // One view for all tabs; switching swaps its EditorState.
    const view = new EditorView({
      parent: host,
      state: tabs.session(tabs.activeId())!.state,
      dispatchTransactions(trs, view) {
        const id = tabs.activeId()
        view.update(trs)
        tabs.saveSession(id, { state: view.state })
        if (trs.some((tr) => tr.docChanged)) {
          tabs.setTitle(id, titleFor(view.state.doc.line(1).text))
          tabs.documentChanged(id, trs)
        }
        if (trs.some((tr) => tr.docChanged || tr.selection)) props.onCursor(cursorOf(view.state))
      },
    })

    tabs.setLanguageEffectsHandler((id, effects) => {
      if (id !== tabs.activeId()) return false
      view.dispatch({ effects })
      return true
    })

    tabs.setFormatHandler((id, transaction) => {
      if (id !== tabs.activeId()) return false
      const scroll = view.scrollSnapshot().map(transaction.changes)
      // Apply the formatting transaction and its mapped scroll anchor together.
      view.dispatch([transaction, transaction.state.update({ effects: scroll })])
      return true
    })

    let shownId = tabs.activeId()

    createEffect(
      on(tabs.activeId, (next) => {
        if (next === shownId) return
        tabs.saveSession(shownId, { state: view.state, scroll: view.scrollSnapshot() })
        shownId = next
        const session = tabs.session(next)
        if (!session) return
        const tabHasFocus = !!document.activeElement?.closest('.tab')
        view.setState(session.state)
        if (session.scroll) view.dispatch({ effects: session.scroll })
        props.onCursor(cursorOf(view.state))
        if (!tabHasFocus) view.focus()
      }),
    )

    props.onCursor(cursorOf(view.state))
    view.focus()
    onCleanup(() => { tabs.setLanguageEffectsHandler(); tabs.setFormatHandler(); view.destroy() })
  })

  return (
    <div
      class="editor"
      id="editor-panel"
      role="tabpanel"
      aria-labelledby={`tab-control-${props.tabs.activeId()}`}
      ref={host}
    />
  )
}
