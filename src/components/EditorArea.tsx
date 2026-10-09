import { createEffect, createSignal, on, onCleanup, onMount, Show } from 'solid-js'
import { Eye, PenLine } from 'lucide-solid'
import type { Tabs } from '../tabs/tabs.ts'
import Editor, { type Cursor } from './Editor.tsx'
import MarkdownPreview from './MarkdownPreview.tsx'

// Split needs room for two readable columns. Measured on the editor area, so
// the vertical tab sidebar is already accounted for.
export const SPLIT_MIN_WIDTH = 900

interface Props {
  tabs: Tabs
  markdown: boolean
  previewOpen: boolean
  onTogglePreview: () => void
  onClosePreview: () => void
  onCursor: (cursor: Cursor) => void
  fontSize: number
  lineNumbers: boolean
}

export default function EditorArea(props: Props) {
  const [width, setWidth] = createSignal(0)
  let frame!: HTMLDivElement
  let focusFrame: number | undefined
  onCleanup(() => { if (focusFrame !== undefined) cancelAnimationFrame(focusFrame) })

  onMount(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(frame)
    onCleanup(() => observer.disconnect())
  })

  const mode = () => {
    if (!props.markdown || !props.previewOpen) return 'off'
    return width() >= SPLIT_MIN_WIDTH ? 'split' : 'full'
  }

  // The editor stays mounted while the preview covers it, so cursor, undo and scroll survive.
  function focusEditor() {
    focusFrame = requestAnimationFrame(() => frame.querySelector<HTMLElement>('.cm-content')?.focus())
  }

  // Covers both the button and the global keyboard shortcut.
  createEffect(on(() => props.previewOpen, open => {
    if (!open) focusEditor()
  }, { defer: true }))

  function closePreview() {
    props.onClosePreview()
  }

  function togglePreview() {
    props.onTogglePreview()
  }

  return (
    <div class="editor-area" ref={frame} data-preview={mode()}>
      <Editor tabs={props.tabs} onCursor={props.onCursor} fontSize={props.fontSize} lineNumbers={props.lineNumbers} />
      <Show when={mode() !== 'off'}>
        <MarkdownPreview tabs={props.tabs} split={mode() === 'split'} onClose={closePreview} />
      </Show>
      <Show when={props.markdown && mode() !== 'split'}>
        <button
          type="button"
          class="preview-toggle"
          aria-pressed={props.previewOpen}
          title={props.previewOpen ? 'Back to the editor (Alt+Shift+P)' : 'Preview Markdown (Alt+Shift+P)'}
          onClick={togglePreview}
        >
          <Show when={props.previewOpen} fallback={<><Eye size={14} /><span>Preview</span></>}>
            <PenLine size={14} /><span>Edit</span>
          </Show>
        </button>
      </Show>
    </div>
  )
}
