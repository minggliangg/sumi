import Settings from './Settings.tsx'
import type { Appearance } from '../appearance.ts'
import type { createFontSize } from '../editor/font-size.ts'
import { createMemo, Show } from 'solid-js'
import { LoaderCircle, WandSparkles } from 'lucide-solid'
import LanguagePicker from './LanguagePicker.tsx'
import type { Tabs as TabModel } from '../tabs/tabs.ts'
import type { createRecovery } from '../storage/recovery.ts'
type Tabs = TabModel & ReturnType<typeof createRecovery>
import type { Cursor } from './Editor.tsx'
import type { createAppUpdate } from '../updates.ts'

export default function StatusBar(props: { cursor: Cursor; update: ReturnType<typeof createAppUpdate>; tabs: Tabs; font: ReturnType<typeof createFontSize>; appearance: Appearance }) {
  const active = createMemo(() => props.tabs.tabs.find(tab => tab.id === props.tabs.activeId()))
  const canFormat = createMemo(() => {
    const tab = active()
    return !!tab?.resolvedLanguage && tab.languageMode !== 'plain' && tab.languageStatus !== 'large'
  })
  const storageLabel = () => {
    switch (props.tabs.storageStatus()) {
      case 'loading': return 'Restoring drafts…'
      case 'saving': return 'Saving…'
      case 'saved': return 'Saved locally'
      default: return 'Not saved'
    }
  }
  return (
    <div class="status" aria-live="off">
      <div class="status-group">
        <span class="storage" data-storage-status={props.tabs.storageStatus()} title={props.tabs.storageEstimate() ? `Browser storage: ${(props.tabs.storageEstimate()!.usage / 1048576).toFixed(1)} MiB used of ${(props.tabs.storageEstimate()!.quota / 1048576).toFixed(0)} MiB estimated quota` : storageLabel()}>
          <span class="status-dot" aria-hidden="true" />
          <span class="storage-text">{storageLabel()}</span>
        </span>
        <Show when={props.tabs.storageStatus() === 'error'}>
          <span role="status" class="status-error">{props.tabs.storageError()}</span>
          <button type="button" class="status-button storage-retry" onClick={() => void props.tabs.storageRetry()}>Retry saving</button>
        </Show>
        <Show when={props.update.available()}>
          <button type="button" class="update-button" disabled={props.update.updating()} onClick={() => void props.update.apply()}>
            {props.update.updating() ? 'Updating…' : 'Update available'}
          </button>
        </Show>
        <Show when={props.update.error()}>
          <span role="status" class="status-error">{props.update.error()}</span>
        </Show>
      </div>
      <div class="status-group status-group-end">
        <Show when={props.cursor.selected > 0}>
          <span class="status-selected">{props.cursor.selected} selected</span>
        </Show>
        <Show when={active()?.formatStatus === 'error'}>
          <span role="status" class="status-error">{active()?.formatError || 'Formatting unavailable'}</span>
        </Show>
        <button
          type="button"
          class="status-button format-button"
          aria-label="Format document"
          data-format-status={active()?.formatStatus ?? 'idle'}
          title="Format document (Ctrl+Shift+F)"
          disabled={!canFormat() || active()?.formatStatus === 'formatting'}
          onClick={() => void props.tabs.formatDocument(props.tabs.activeId())}
        >
          {active()?.formatStatus === 'formatting' ? <LoaderCircle size={14} class="spin" /> : <WandSparkles size={14} />}
          <span class="status-label">{active()?.formatStatus === 'formatting' ? 'Formatting…' : active()?.formatStatus === 'error' ? 'Retry format' : 'Format'}</span>
        </button>
        <Settings font={props.font} update={props.update} appearance={props.appearance} />
        <LanguagePicker tabs={props.tabs} />
        <span class="status-position">
          Ln {props.cursor.line}, Col {props.cursor.col}
        </span>
      </div>
    </div>
  )
}
