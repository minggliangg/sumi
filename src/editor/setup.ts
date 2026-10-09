import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
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
  '.cm-content': { padding: '16px 0 24vh', caretColor: 'var(--fg)' },
  '.cm-line': { padding: '0 clamp(16px, 3vw, 40px)' },
  '.cm-cursor, .cm-dropCursor': { borderLeft: '2px solid var(--fg)' },
  '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground':
    { backgroundColor: 'var(--selection)' },
})

// Base extensions shared by plain-text and code modes.
// The compartment is present even in plain text, preserving state when reconfigured.
export const languageCompartment = new Compartment()
const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, class: 'tok-keyword' },
  { tag: [tags.string, tags.special(tags.string)], class: 'tok-string' },
  { tag: [tags.number, tags.bool, tags.null], class: 'tok-number' },
  { tag: tags.comment, class: 'tok-comment' },
])
export const baseExtensions: Extension[] = [
  history(),
  languageCompartment.of([]),
  syntaxHighlighting(highlightStyle),
  drawSelection(),
  highlightActiveLine(),
  EditorView.lineWrapping,
  EditorView.contentAttributes.of({ 'aria-label': 'Text editor' }),
  keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
  theme,
]

export function createEditorState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: baseExtensions })
}
