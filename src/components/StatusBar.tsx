import { createMemo, Show } from 'solid-js'
import LanguagePicker from './LanguagePicker.tsx'
import type { Tabs } from '../tabs/tabs.ts'
import type { Cursor } from './Editor.tsx'
import type { createAppUpdate } from '../updates.ts'

export default function StatusBar(props: { cursor: Cursor; update: ReturnType<typeof createAppUpdate>; tabs: Tabs }) {
  const active = createMemo(() => props.tabs.tabs.find(tab => tab.id === props.tabs.activeId()))
  const canFormat = createMemo(() => {
    const tab = active()
    return !!tab?.resolvedLanguage && tab.languageMode !== 'plain' && tab.languageStatus !== 'large'
  })
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
      <button
        type="button"
        class="format-button"
        aria-label="Format document"
        data-format-status={active()?.formatStatus ?? 'idle'}
        title="Format document (Ctrl+Shift+F)"
        disabled={!canFormat() || active()?.formatStatus === 'formatting'}
        onClick={() => void props.tabs.formatDocument(props.tabs.activeId())}
      >
        {active()?.formatStatus === 'formatting' ? 'Formatting…' : active()?.formatStatus === 'error' ? 'Retry format' : 'Format'}
      </button>
      <Show when={active()?.formatStatus === 'error'}>
        <span role="status">{active()?.formatError || 'Formatting unavailable'}</span>
      </Show>
      <LanguagePicker tabs={props.tabs} />
      <span>
        Ln {props.cursor.line}, Col {props.cursor.col}
      </span>
    </div>
  )
}
