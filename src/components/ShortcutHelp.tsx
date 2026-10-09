import { createEffect, For, onCleanup } from 'solid-js'
import { shortcuts } from '../shortcuts.ts'

export default function ShortcutHelp(props: { open: boolean; onClose: () => void }) {
  let dialog!: HTMLDialogElement

  createEffect(() => {
    if (props.open && !dialog.open) dialog.showModal()
    else if (!props.open && dialog.open) dialog.close()
  })
  onCleanup(() => {
    if (dialog.open) dialog.close()
  })

  return (
    <dialog
      ref={dialog}
      id="shortcut-help"
      class="shortcut-help"
      aria-labelledby="shortcut-title"
      onCancel={(e) => {
        e.preventDefault()
        props.onClose()
      }}
      onClose={() => {
        // Native close events are queued; don't dismiss a newly reopened panel.
        if (!dialog.open) props.onClose()
      }}
    >
      <div class="shortcut-heading">
        <h1 id="shortcut-title">Keyboard shortcuts</h1>
        <button type="button" class="tabbar-button" aria-label="Close keyboard shortcuts" onClick={props.onClose} autofocus>×</button>
      </div>
      <p class="shortcut-intro">Use either set while writing. Try Ctrl+Shift if Alt is unavailable on your keyboard.</p>
      <table>
        <thead><tr><th scope="col">Action</th><th scope="col">Alt</th><th scope="col">Ctrl+Shift</th></tr></thead>
        <tbody>
          <For each={shortcuts}>{(shortcut) => (
            <tr><th scope="row">{shortcut.label}</th><td>{shortcut.altLabel ? <kbd>{shortcut.altLabel}</kbd> : '—'}</td><td>{shortcut.ctrlShiftLabel ? <kbd>{shortcut.ctrlShiftLabel}</kbd> : '—'}</td></tr>
          )}</For>
        </tbody>
      </table>
      <p class="shortcut-note">On Mac, Alt is Option; Ctrl means Control.</p>
      <p class="shortcut-note">To reach the tab bar from the editor, press Escape, then Tab. Use arrows to switch, Home/End to jump, and Delete to close the focused tab.</p>
      <p class="shortcut-note">Tab indents in the editor. Escape closes this panel. Closing a tab with text asks for confirmation.</p>
    </dialog>
  )
}
