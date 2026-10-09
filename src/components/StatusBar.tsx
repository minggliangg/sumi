import { Show } from 'solid-js'
import LanguagePicker from './LanguagePicker.tsx'
import type { Tabs } from '../tabs/tabs.ts'
import type { Cursor } from './Editor.tsx'
import type { createAppUpdate } from '../updates.ts'

export default function StatusBar(props: { cursor: Cursor; update: ReturnType<typeof createAppUpdate>; tabs: Tabs }) {
  return (
    <div class="status" aria-live="off">
      <Show when={props.update.available()}>
        <button type="button" class="update-button" disabled={props.update.updating()} onClick={() => void props.update.apply()}>
          {props.update.updating() ? 'Updating…' : 'Update available'}
        </button>
      </Show>
      <Show when={props.update.error()}>
        <span role="status">{props.update.error()}</span>
      </Show>
      <Show when={props.cursor.selected > 0}>
        <span>{props.cursor.selected} selected</span>
      </Show>
      <LanguagePicker tabs={props.tabs} />
      <span>
        Ln {props.cursor.line}, Col {props.cursor.col}
      </span>
    </div>
  )
}
