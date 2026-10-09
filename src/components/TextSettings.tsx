import { onCleanup, Show } from 'solid-js'
import { MIN_FONT_SIZE, MAX_FONT_SIZE, type createFontSize } from '../editor/font-size.ts'
import type { createAppUpdate } from '../updates.ts'

export default function TextSettings(props: { font: ReturnType<typeof createFontSize>; update: ReturnType<typeof createAppUpdate> }) {
  let dialog!: HTMLDialogElement
  let trigger!: HTMLButtonElement
  function close() { dialog.close(); trigger.focus() }
  onCleanup(() => { if (dialog.open) dialog.close() })
  return <>
    <button ref={trigger} type="button" class="text-size-button" aria-label="Text size" aria-haspopup="dialog" aria-controls="text-settings" title="Text size and updates" onClick={() => dialog.showModal()}>Aa</button>
    <dialog ref={dialog} id="text-settings" class="text-settings" aria-labelledby="text-settings-title" onCancel={event => { event.preventDefault(); close() }}>
      <div class="shortcut-heading">
        <h1 id="text-settings-title">Text size and updates</h1>
        <button type="button" class="tabbar-button" aria-label="Close text settings" onClick={close}>×</button>
      </div>
      <label class="font-size-label" for="editor-font-size">Editor font size <output>{props.font.size()} px</output></label>
      <div class="font-size-controls">
        <button type="button" class="size-step" aria-label="Decrease font size" disabled={props.font.size() <= MIN_FONT_SIZE} onClick={() => props.font.set(props.font.size() - 1)}>A−</button>
        <input id="editor-font-size" type="range" min={MIN_FONT_SIZE} max={MAX_FONT_SIZE} step="1" value={props.font.size()} aria-label="Editor font size" onInput={event => props.font.set(Number(event.currentTarget.value))} />
        <button type="button" class="size-step" aria-label="Increase font size" disabled={props.font.size() >= MAX_FONT_SIZE} onClick={() => props.font.set(props.font.size() + 1)}>A+</button>
      </div>
      <button type="button" class="settings-action" aria-label="Reset font size" onClick={() => props.font.set(MIN_FONT_SIZE)}>Reset to 16 px</button>
      <Show when={props.font.error()}><p role="status">{props.font.error()}</p></Show>
      <div class="settings-updates">
        <button type="button" class="settings-action" aria-label="Check for updates" disabled={props.update.checking() || props.update.updating()} onClick={() => void props.update.check()}>{props.update.checking() ? 'Checking…' : 'Check for updates'}</button>
        <Show when={props.update.checkMessage()}><p role="status">{props.update.checkMessage()}</p></Show>
        <Show when={props.update.available()}>
          <button type="button" class="settings-action" aria-label="Install update" disabled={props.update.updating()} onClick={() => { close(); void props.update.apply() }}>Install update</button>
        </Show>
      </div>
    </dialog>
  </>
}
