import Settings from './Settings.tsx'
import Timer from './Timer.tsx'
import type { Appearance } from '../appearance.ts'
import type { createFontSize } from '../editor/font-size.ts'
import { createMemo, Show } from 'solid-js'
import { CircleArrowUp, LoaderCircle, PanelLeftClose, PanelLeftOpen, WandSparkles } from 'lucide-solid'
import LanguagePicker from './LanguagePicker.tsx'
import type { Tabs as TabModel } from '../tabs/tabs.ts'
import type { createRecovery } from '../storage/recovery.ts'
type Tabs = TabModel & ReturnType<typeof createRecovery>
import type { createAppUpdate } from '../updates.ts'

export default function StatusBar(props: { selected: number; update: ReturnType<typeof createAppUpdate>; tabs: Tabs; font: ReturnType<typeof createFontSize>; appearance: Appearance; tabsToggle: { available: boolean; hidden: boolean; toggle: () => void } }) {
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
  const formatError = () => active()?.formatStatus === 'error' ? active()?.formatError || 'Formatting unavailable' : ''
  const hasNotices = () => props.tabs.storageStatus() === 'error' || !!props.update.error() || !!formatError()
  return (
    <div class="status" aria-live="off">
      {/* Messages get their own full-width row so the controls below never reflow when one appears. */}
      <Show when={hasNotices()}>
        <div class="status-notices">
          <Show when={props.tabs.storageStatus() === 'error'}>
            <span role="status" class="status-error">{props.tabs.storageError()}</span>
            <button type="button" class="status-button storage-retry" onClick={() => void props.tabs.storageRetry()}>Retry saving</button>
          </Show>
          <Show when={props.update.error()}>
            <span role="status" class="status-error">{props.update.error()}</span>
          </Show>
          <Show when={formatError()}>
            <span role="status" class="status-error">{formatError()}</span>
          </Show>
        </div>
      </Show>
      <div class="status-group">
        <Show when={props.tabsToggle.available}>
          <button
            type="button"
            class="status-button tabs-toggle"
            aria-expanded={!props.tabsToggle.hidden}
            aria-controls="tab-panel"
            title={`${props.tabsToggle.hidden ? 'Show' : 'Hide'} vertical tabs (Alt+Shift+B)`}
            onClick={props.tabsToggle.toggle}
          >
            {props.tabsToggle.hidden ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            <span class="status-label">{props.tabsToggle.hidden ? 'Show tabs' : 'Hide tabs'}</span>
          </button>
        </Show>
        <span class="storage" data-storage-status={props.tabs.storageStatus()} title={props.tabs.storageEstimate() ? `Browser storage: ${(props.tabs.storageEstimate()!.usage / 1048576).toFixed(1)} MiB used of ${(props.tabs.storageEstimate()!.quota / 1048576).toFixed(0)} MiB estimated quota` : storageLabel()}>
          <span class="status-dot" aria-hidden="true" />
          <span class="storage-text">{storageLabel()}</span>
        </span>
        <Show when={props.update.available()}>
          <button type="button" class="update-button" disabled={props.update.updating()} onClick={() => void props.update.apply()}>
            {props.update.updating() ? <LoaderCircle size={14} class="spin" /> : <CircleArrowUp size={14} />}
            <span class="status-label">{props.update.updating() ? 'Updating…' : 'Update available'}</span>
          </button>
        </Show>
      </div>
      <div class="status-group status-group-end">
        <Show when={props.selected > 0}>
          <span class="status-selected">{props.selected} selected</span>
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
        <Timer />
        <Settings font={props.font} update={props.update} appearance={props.appearance} />
        <LanguagePicker tabs={props.tabs} />
      </div>
    </div>
  )
}
