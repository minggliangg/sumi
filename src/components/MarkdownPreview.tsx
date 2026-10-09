import { createEffect, createSignal, on, onCleanup, Show } from 'solid-js'
import { X } from 'lucide-solid'
import type { Tabs } from '../tabs/tabs.ts'
import { renderMarkdown } from '../preview/markdown.ts'

// Above this size, re-rendering on every pause costs more than it helps.
export const PREVIEW_LIMIT = 512 * 1024
const DEBOUNCE_MS = 180

interface Props {
  tabs: Tabs
  split: boolean
  onClose: () => void
}

export default function MarkdownPreview(props: Props) {
  const [html, setHtml] = createSignal('')
  const [paused, setPaused] = createSignal(false)
  // Set when the reader asks for a large document; cleared when the tab changes.
  let allowLarge = false
  let token = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  async function render(force = false) {
    const id = props.tabs.activeId()
    const session = props.tabs.session(id)
    if (!session) return
    if (force) allowLarge = true
    if (!allowLarge && session.state.doc.length > PREVIEW_LIMIT) {
      token++
      setPaused(true)
      return
    }
    setPaused(false)
    const current = ++token
    const rendered = await renderMarkdown(session.state.doc.toString())
    // A newer render or a tab change has superseded this one.
    if (current === token) setHtml(rendered)
  }

  // Switching tabs renders immediately so the pane never shows the previous document.
  createEffect(on(() => props.tabs.activeId(), () => {
    allowLarge = false
    clearTimeout(timer)
    void render()
  }))

  // Edits and restores are debounced so typing stays smooth.
  createEffect(on(() => [props.tabs.contentVersion(), props.tabs.workspaceVersion()], () => {
    clearTimeout(timer)
    timer = setTimeout(() => void render(), DEBOUNCE_MS)
  }, { defer: true }))

  onCleanup(() => {
    clearTimeout(timer)
    token++
  })

  return (
    <section class="preview-pane" aria-label="Markdown preview">
      <Show when={props.split}>
        <header class="preview-header">
          <span>Preview</span>
          <button type="button" class="tabbar-button" aria-label="Hide preview" title="Hide preview (Alt+Shift+P)" onClick={props.onClose}>
            <X size={16} />
          </button>
        </header>
      </Show>
      <Show
        when={!paused()}
        fallback={
          <div class="preview-paused" role="status">
            <p>Preview paused for a document this large.</p>
            <button type="button" class="status-button" onClick={() => void render(true)}>Render preview</button>
          </div>
        }
      >
        <article class="preview-body" innerHTML={html()} />
      </Show>
    </section>
  )
}
