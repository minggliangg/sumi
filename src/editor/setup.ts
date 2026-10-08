import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, drawSelection, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'

const theme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--fg)',
    backgroundColor: 'var(--bg)',
    fontSize: '15px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.7',
  },
  // Generous bottom padding lets the last line scroll up away from the screen edge.
  '.cm-content': { padding: '28px 0 40vh', caretColor: 'var(--fg)' },
  '.cm-line': { padding: '0 clamp(20px, 6vw, 80px)' },
  '.cm-cursor, .cm-dropCursor': { borderLeft: '2px solid var(--fg)' },
  '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
    { backgroundColor: 'var(--selection)' },
})

// Base extensions shared by plain-text and code modes.
// Language support / syntax highlighting will be added as an optional layer later.
export const baseExtensions: Extension[] = [
  history(),
  drawSelection(),
  highlightActiveLine(),
  EditorView.lineWrapping,
  keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
  theme,
]

export function createEditorState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: baseExtensions })
}
