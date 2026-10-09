import { createEffect, For, onCleanup, Show } from 'solid-js'
import { Trash2, X } from 'lucide-solid'
import type { Tabs } from '../tabs/tabs.ts'

export default function Recovery(props: { tabs: Tabs; open: boolean; onClose: () => void }) {
  let dialog!: HTMLDialogElement
  function close() {
    props.onClose()
    // On narrow screens the control lives in the overflow menu.
    document.querySelector<HTMLButtonElement>('button[aria-label="Recently closed"], button[aria-label="More actions"]')?.focus()
  }
  createEffect(() => {
    if (props.open && !dialog.open) dialog.showModal()
    else if (!props.open && dialog.open) dialog.close()
  })
  onCleanup(() => { if (dialog.open) dialog.close() })
  return (
    <dialog
      ref={dialog}
      id="recovery-dialog"
      class="dialog recovery-dialog"
      aria-labelledby="recovery-title"
      onCancel={(event) => { event.preventDefault(); close() }}
      onClose={() => { if (!dialog.open) props.onClose() }}
    >
      <div class="shortcut-heading">
        <h1 id="recovery-title">Recently closed</h1>
        <button type="button" class="tabbar-button" aria-label="Close recently closed" autofocus onClick={close}><X size={18} /></button>
      </div>
      <p class="recovery-intro">Your 20 most recently closed non-empty drafts stay on this device. Choose a draft to reopen it, or delete it permanently.</p>
      <div class="recovery-list">
        <For each={props.tabs.closedTabs()}>{(tab) => (
          <div class="recovery-item">
            <button type="button" class="recovery-restore" aria-label={`Restore ${tab.title}`} onClick={() => { props.tabs.recover(tab.id); close() }}>
              <span class="recovery-title">{tab.title}</span>
              <time dateTime={new Date(tab.closedAt).toISOString()}>{new Date(tab.closedAt).toLocaleString()}</time>
            </button>
            <button type="button" class="recovery-delete" aria-label={`Delete ${tab.title}`} onClick={() => {
              if (window.confirm('Delete this draft permanently?')) props.tabs.deleteClosed(tab.id)
            }}><Trash2 size={15} /><span>Delete</span></button>
          </div>
        )}</For>
        <Show when={props.tabs.closedTabs().length === 0}><p class="recovery-empty">No recently closed drafts.</p></Show>
      </div>
    </dialog>
  )
}
