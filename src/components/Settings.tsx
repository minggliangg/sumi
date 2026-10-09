import { For, onCleanup, Show } from 'solid-js'
import { Check, Monitor, Moon, SlidersHorizontal, Sun, X } from 'lucide-solid'
import { MIN_FONT_SIZE, MAX_FONT_SIZE, type createFontSize } from '../editor/font-size.ts'
import { THEMES, type Appearance, type ThemeMode } from '../appearance.ts'
import type { createAppUpdate } from '../updates.ts'

const MODES: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: 'system', label: 'System', icon: Monitor },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
]

export default function Settings(props: { font: ReturnType<typeof createFontSize>; update: ReturnType<typeof createAppUpdate>; appearance: Appearance }) {
  let dialog!: HTMLDialogElement
  let trigger!: HTMLButtonElement
  function close() { dialog.close(); trigger.focus() }
  onCleanup(() => { if (dialog.open) dialog.close() })
  return <>
    <button ref={trigger} type="button" class="settings-button" aria-label="Settings" aria-haspopup="dialog" aria-controls="settings" title="Settings: theme, line numbers, text size and updates" onClick={() => dialog.showModal()}><SlidersHorizontal size={16} /></button>
    <dialog ref={dialog} id="settings" class="dialog settings" aria-labelledby="settings-title" onCancel={event => { event.preventDefault(); close() }}>
      <div class="shortcut-heading">
        <h1 id="settings-title">Settings</h1>
        <button type="button" class="tabbar-button" aria-label="Close settings" onClick={close}><X size={18} /></button>
      </div>

      <section class="settings-section" aria-labelledby="settings-appearance">
        <h2 id="settings-appearance">Appearance</h2>
        <div class="segmented" role="group" aria-label="Colour mode">
          <For each={MODES}>{(mode) => (
            <button type="button" class="segment" aria-pressed={props.appearance.mode() === mode.id} onClick={() => props.appearance.setMode(mode.id)}>
              <mode.icon size={14} />
              <span>{mode.label}</span>
            </button>
          )}</For>
        </div>
        <div class="theme-grid" role="group" aria-label="Theme">
          <For each={THEMES}>{(theme) => (
            // Each card carries its own theme attributes, so it previews that palette.
            <button type="button" class="theme-card" data-theme={theme.id} data-mode={props.appearance.resolved()} aria-pressed={props.appearance.theme() === theme.id} onClick={() => props.appearance.setTheme(theme.id)}>
              <span class="theme-preview" aria-hidden="true">
                <span class="theme-line"><i style={{ background: 'var(--syntax-keyword)', width: '22%' }} /><i style={{ background: 'var(--syntax-function)', width: '34%' }} /></span>
                <span class="theme-line"><i style={{ background: 'var(--syntax-string)', width: '46%' }} /></span>
                <span class="theme-line"><i style={{ background: 'var(--syntax-type)', width: '18%' }} /><i style={{ background: 'var(--syntax-comment)', width: '30%' }} /></span>
              </span>
              <span class="theme-name">
                <span>{theme.label}</span>
                <Show when={props.appearance.theme() === theme.id}><Check size={13} /></Show>
              </span>
            </button>
          )}</For>
        </div>
        <Show when={props.appearance.error()}><p role="status" class="status-error">{props.appearance.error()}</p></Show>
      </section>

      <section class="settings-section" aria-labelledby="settings-editor">
        <h2 id="settings-editor">Editor</h2>
        <div class="setting-row">
          <label id="line-numbers-label" for="line-numbers-switch">
            Line numbers
            <small>Alt+Shift+N</small>
          </label>
          <button id="line-numbers-switch" type="button" class="switch" role="switch" aria-checked={props.appearance.lineNumbers()} aria-labelledby="line-numbers-label" onClick={() => props.appearance.setLineNumbers(!props.appearance.lineNumbers())}>
            <span class="switch-thumb" />
          </button>
        </div>
        <label class="font-size-label" for="editor-font-size">Editor font size <output>{props.font.size()} px</output></label>
        <div class="font-size-controls">
          <button type="button" class="size-step" aria-label="Decrease font size" disabled={props.font.size() <= MIN_FONT_SIZE} onClick={() => props.font.set(props.font.size() - 1)}>A−</button>
          <input id="editor-font-size" type="range" min={MIN_FONT_SIZE} max={MAX_FONT_SIZE} step="1" value={props.font.size()} aria-label="Editor font size" onInput={event => props.font.set(Number(event.currentTarget.value))} />
          <button type="button" class="size-step" aria-label="Increase font size" disabled={props.font.size() >= MAX_FONT_SIZE} onClick={() => props.font.set(props.font.size() + 1)}>A+</button>
        </div>
        <button type="button" class="settings-action" aria-label="Reset font size" onClick={() => props.font.set(MIN_FONT_SIZE)}>Reset to 16 px</button>
        <Show when={props.font.error()}><p role="status">{props.font.error()}</p></Show>
      </section>

      <section class="settings-section settings-updates" aria-labelledby="settings-updates">
        <h2 id="settings-updates">Updates</h2>
        <button type="button" class="settings-action" aria-label="Check for updates" disabled={props.update.checking() || props.update.updating()} onClick={() => void props.update.check()}>{props.update.checking() ? 'Checking…' : 'Check for updates'}</button>
        <Show when={props.update.checkMessage()}><p role="status">{props.update.checkMessage()}</p></Show>
        <Show when={props.update.available()}>
          <button type="button" class="settings-action" aria-label="Install update" disabled={props.update.updating()} onClick={() => { close(); void props.update.apply() }}>Install update</button>
        </Show>
      </section>
    </dialog>
  </>
}
