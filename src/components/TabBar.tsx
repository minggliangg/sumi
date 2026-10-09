import { createEffect, For, onCleanup, type JSX } from 'solid-js'
import type { Tabs } from '../tabs/tabs.ts'

export type TabLayout = 'horizontal' | 'vertical'

interface Props {
  tabs: Tabs
  layout: TabLayout
  onToggleLayout: () => void
  onShowShortcuts: () => void
  shortcutsOpen: boolean
  onRename: (id: string) => void
  onImport: () => void
  onExport: () => void
  onRecovery: () => void
  recoveryOpen: boolean
  actionsDisabled: boolean
}

function Icon(props: { children: JSX.Element }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{props.children}</svg>
}

export default function TabBar(props: Props) {
  const refs = new Map<string, HTMLButtonElement>()

  createEffect(() => {
    // Recheck visibility when the bar changes orientation, too.
    props.layout
    refs.get(props.tabs.activeId())?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })

  function onTabKeyDown(e: KeyboardEvent, id: string) {
    const list = props.tabs.tabs
    const index = list.findIndex((tab) => tab.id === id)
    const previous = props.layout === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
    const next = props.layout === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
    let target: number
    if (e.key === 'F2') { e.preventDefault(); props.onRename(id); return }
    if (e.key === previous) target = (index - 1 + list.length) % list.length
    else if (e.key === next) target = (index + 1) % list.length
    else if (e.key === 'Home') target = 0
    else if (e.key === 'End') target = list.length - 1
    else if (e.key === 'Delete') {
      e.preventDefault()
      props.tabs.close(id)
      refs.get(props.tabs.activeId())?.focus()
      return
    } else return
    e.preventDefault()
    const tab = list[target]
    refs.get(tab.id)?.focus()
    props.tabs.select(tab.id)
  }

  return (
    // Pointer clicks retain the editor caret; keyboard focus stays on tab controls.
    <nav class="tabbar" aria-label="Editor tabs" onMouseDown={(e) => e.preventDefault()}>
      <div class="tabbar-list" role="tablist" aria-label="Open documents" aria-orientation={props.layout}>
        <For each={props.tabs.tabs}>
          {(tab) => {
            onCleanup(() => refs.delete(tab.id))
            return (
              <div
                class="tab"
                role="presentation"
                data-active={props.tabs.activeId() === tab.id}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault()
                    props.tabs.close(tab.id)
                  }
                }}
              >
                <button
                  ref={(el) => refs.set(tab.id, el)}
                  type="button"
                  role="tab"
                  id={`tab-control-${tab.id}`}
                  class="tab-select"
                  aria-selected={props.tabs.activeId() === tab.id}
                  aria-controls="editor-panel"
                  tabIndex={props.tabs.activeId() === tab.id ? 0 : -1}
                  title={`${tab.title} (double-click or F2 to rename)`}
                  onClick={() => props.tabs.select(tab.id)}
                  onDblClick={() => props.onRename(tab.id)}
                  onKeyDown={(e) => onTabKeyDown(e, tab.id)}
                >
                  <span class="tab-title">{tab.title}</span>
                </button>
                <button
                  type="button"
                  class="tab-close"
                  aria-label={`Close ${tab.title}`}
                  title="Close tab (Delete when the tab is focused)"
                  onClick={() => props.tabs.close(tab.id)}
                >
                  ×
                </button>
              </div>
            )
          }}
        </For>
      </div>
      <div class="tabbar-actions">
        <button type="button" class="tabbar-button" aria-label="Open file" title="Open file as a local draft" disabled={props.actionsDisabled} onClick={props.onImport}>
          <Icon><path d="M3 8V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v2M3 8h17l-2 12H5a2 2 0 0 1-2-2Z" /></Icon>
        </button>
        <button type="button" class="tabbar-button" aria-label="Export file" title="Export a copy of this draft" disabled={props.actionsDisabled || !props.tabs.activeId()} onClick={props.onExport}>
          <Icon><path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4" /></Icon>
        </button>
        <button type="button" class="tabbar-button" aria-label="Recently closed" title="Recently closed drafts" aria-haspopup="dialog" aria-controls="recovery-dialog" aria-expanded={props.recoveryOpen} disabled={props.actionsDisabled} onClick={props.onRecovery}>
          <Icon><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2" /></Icon>
        </button>
        <button type="button" class="tabbar-button" aria-label="New tab" title="New tab (Alt+N or Ctrl+Shift+Enter)" disabled={props.actionsDisabled} onClick={() => props.tabs.open()}>
          <Icon><path d="M12 5v14M5 12h14" /></Icon>
        </button>
        <button
          type="button"
          class="tabbar-button"
          aria-label="Toggle tab layout"
          title="Toggle tab layout (Alt+Shift+L or Ctrl+Shift+L)"
          onClick={props.onToggleLayout}
        >
          <Icon>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            {props.layout === 'horizontal' ? <path d="M9 4v16" /> : <path d="M3 9h18" />}
          </Icon>
        </button>
        <button
          type="button"
          class="tabbar-button"
          aria-label="Keyboard shortcuts"
          aria-haspopup="dialog"
          aria-controls="shortcut-help"
          aria-expanded={props.shortcutsOpen}
          title="Keyboard shortcuts (Alt+/ or Ctrl+Shift+/)"
          onClick={props.onShowShortcuts}
        >
          <Icon>
            <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
            <path d="M6 9h2m3 0h2m3 0h2M6 12h2m3 0h2m3 0h2M7 15h10" />
          </Icon>
        </button>
      </div>
    </nav>
  )
}
