import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js'
import { Download, FolderOpen, History, Keyboard, PanelLeft, PanelTop, Pencil, Plus, X } from 'lucide-solid'
import type { Tabs } from '../tabs/tabs.ts'
import { COMPACT_QUERY, createMediaQuery } from '../media.ts'
import Menu, { type MenuItem } from './Menu.tsx'

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

export default function TabBar(props: Props) {
  const refs = new Map<string, HTMLButtonElement>()
  const compact = createMediaQuery(COMPACT_QUERY)
  // On phones the vertical tab list becomes a drawer instead of a sidebar.
  const drawerMode = () => compact() && props.layout === 'vertical'
  const [drawerOpen, setDrawerOpen] = createSignal(false)
  const [edges, setEdges] = createSignal({ start: false, end: false })
  const activeTitle = () => props.tabs.tabs.find((tab) => tab.id === props.tabs.activeId())?.title ?? ''
  let list!: HTMLDivElement
  let revealed = false
  let drawerToggle: HTMLButtonElement | undefined
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  function measure() {
    if (!list) return
    const horizontal = props.layout === 'horizontal'
    const position = horizontal ? list.scrollLeft : list.scrollTop
    const extent = horizontal ? list.scrollWidth - list.clientWidth : list.scrollHeight - list.clientHeight
    setEdges({ start: position > 1, end: position < extent - 1 })
  }

  // Scroll only along the list's own axis: scrollIntoView would also scroll
  // ancestors and the cross axis.
  function revealActive(smooth = false) {
    const tab = refs.get(props.tabs.activeId())?.parentElement
    if (!tab || !list) return
    const a = tab.getBoundingClientRect()
    const b = list.getBoundingClientRect()
    const pad = 28
    const horizontal = props.layout === 'horizontal'
    const before = horizontal ? a.left - b.left - pad : a.top - b.top - pad
    const after = horizontal ? a.right - b.right + pad : a.bottom - b.bottom + pad
    const delta = before < 0 ? before : after > 0 ? after : 0
    if (!delta) return
    list.scrollBy({ [horizontal ? 'left' : 'top']: delta, behavior: smooth && !reducedMotion.matches ? 'smooth' : 'instant' })
  }

  createEffect(on(
    () => [props.tabs.activeId(), props.layout, props.tabs.tabs.length, drawerOpen(), compact()] as const,
    () => {
      const smooth = revealed
      revealed = revealed || refs.size > 0
      queueMicrotask(() => { revealActive(smooth); measure() })
    },
  ))

  createEffect(() => { if (!drawerMode()) setDrawerOpen(false) })

  onMount(() => {
    // Resizing (rotation, window changes, layout swaps) can push the active tab out of view.
    const observer = new ResizeObserver(() => { revealActive(); measure() })
    observer.observe(list)
    onCleanup(() => observer.disconnect())
  })

  function closeDrawer(restoreFocus = false) {
    if (!drawerOpen()) return
    setDrawerOpen(false)
    if (restoreFocus) drawerToggle?.focus()
  }

  function openDrawer() {
    setDrawerOpen(true)
    requestAnimationFrame(() => refs.get(props.tabs.activeId())?.focus())
  }

  function onWheel(e: WheelEvent) {
    // Let a vertical wheel scroll the strip sideways instead of doing nothing.
    if (props.layout !== 'horizontal' || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
    e.preventDefault()
    list.scrollLeft += e.deltaY
  }

  function onTabKeyDown(e: KeyboardEvent, id: string) {
    const tabs = props.tabs.tabs
    const index = tabs.findIndex((tab) => tab.id === id)
    const previous = props.layout === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
    const next = props.layout === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
    let target: number
    if (e.key === 'F2') { e.preventDefault(); props.onRename(id); return }
    if (e.key === previous) target = (index - 1 + tabs.length) % tabs.length
    else if (e.key === next) target = (index + 1) % tabs.length
    else if (e.key === 'Home') target = 0
    else if (e.key === 'End') target = tabs.length - 1
    else if (e.key === 'Delete') {
      e.preventDefault()
      props.tabs.close(id)
      refs.get(props.tabs.activeId())?.focus()
      return
    } else return
    e.preventDefault()
    const tab = tabs[target]
    refs.get(tab.id)?.focus()
    props.tabs.select(tab.id)
  }

  const menuItems = (): MenuItem[] => [
    { label: 'Rename tab', icon: Pencil, onSelect: () => props.onRename(props.tabs.activeId()), disabled: props.actionsDisabled || !props.tabs.activeId() },
    { label: 'Open file', icon: FolderOpen, onSelect: props.onImport, disabled: props.actionsDisabled },
    { label: 'Export file', icon: Download, onSelect: props.onExport, disabled: props.actionsDisabled || !props.tabs.activeId() },
    { label: 'Recently closed', icon: History, onSelect: props.onRecovery, disabled: props.actionsDisabled, controls: 'recovery-dialog', expanded: props.recoveryOpen },
    props.layout === 'horizontal'
      ? { label: 'Use vertical tabs', icon: PanelLeft, onSelect: props.onToggleLayout }
      : { label: 'Use horizontal tabs', icon: PanelTop, onSelect: props.onToggleLayout },
    { label: 'Keyboard shortcuts', icon: Keyboard, onSelect: props.onShowShortcuts, controls: 'shortcut-help', expanded: props.shortcutsOpen },
  ]

  return (
    // Pointer clicks retain the editor caret; keyboard focus stays on tab controls.
    <nav
      class="tabbar"
      aria-label="Editor tabs"
      data-compact={compact()}
      data-drawer={drawerMode()}
      data-drawer-open={drawerOpen()}
      onMouseDown={(e) => e.preventDefault()}
      onKeyDown={(e) => { if (e.key === 'Escape' && drawerOpen()) { e.preventDefault(); e.stopPropagation(); closeDrawer(true) } }}
    >
      <Show when={drawerMode()}>
        <button
          ref={drawerToggle}
          type="button"
          class="drawer-toggle"
          aria-label="Show tabs"
          aria-haspopup="true"
          aria-controls="tab-panel"
          aria-expanded={drawerOpen()}
          onClick={() => (drawerOpen() ? closeDrawer() : openDrawer())}
        >
          <PanelLeft size={18} />
          <span class="drawer-count" aria-hidden="true">{props.tabs.tabs.length}</span>
          <span class="drawer-title">{activeTitle()}</span>
        </button>
      </Show>
      <div class="tabbar-panel" id="tab-panel">
        <Show when={drawerMode()}>
          <div class="drawer-header">
            <span>Tabs</span>
            <button type="button" class="tabbar-button" aria-label="Hide tabs" onClick={() => closeDrawer(true)}><X size={18} /></button>
          </div>
        </Show>
        <div
          ref={list}
          class="tabbar-list"
          role="tablist"
          aria-label="Open documents"
          aria-orientation={props.layout}
          data-edge-start={edges().start}
          data-edge-end={edges().end}
          onScroll={measure}
          onWheel={onWheel}
        >
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
                    onClick={() => { props.tabs.select(tab.id); if (drawerMode()) closeDrawer(true) }}
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
                    <X size={14} />
                  </button>
                </div>
              )
            }}
          </For>
        </div>
      </div>
      <Show when={drawerMode()}>
        <div class="drawer-scrim" aria-hidden="true" onClick={() => closeDrawer()} />
      </Show>
      <div class="tabbar-actions">
        <Show
          when={!compact()}
          fallback={
            <>
              <button type="button" class="tabbar-button" aria-label="New tab" disabled={props.actionsDisabled} onClick={() => props.tabs.open()}>
                <Plus size={18} />
              </button>
              <Menu label="More actions" items={menuItems()} />
            </>
          }
        >
          <button type="button" class="tabbar-button" aria-label="Open file" title="Open file as a local draft" disabled={props.actionsDisabled} onClick={props.onImport}>
            <FolderOpen size={18} />
          </button>
          <button type="button" class="tabbar-button" aria-label="Export file" title="Export a copy of this draft" disabled={props.actionsDisabled || !props.tabs.activeId()} onClick={props.onExport}>
            <Download size={18} />
          </button>
          <button type="button" class="tabbar-button" aria-label="Recently closed" title="Recently closed drafts" aria-haspopup="dialog" aria-controls="recovery-dialog" aria-expanded={props.recoveryOpen} disabled={props.actionsDisabled} onClick={props.onRecovery}>
            <History size={18} />
          </button>
          <span class="tabbar-separator" aria-hidden="true" />
          <button type="button" class="tabbar-button" aria-label="New tab" title="New tab (Alt+N or Ctrl+Shift+Enter)" disabled={props.actionsDisabled} onClick={() => props.tabs.open()}>
            <Plus size={18} />
          </button>
          <button
            type="button"
            class="tabbar-button"
            aria-label="Toggle tab layout"
            title={`Switch to ${props.layout === 'horizontal' ? 'vertical' : 'horizontal'} tabs (Alt+Shift+L or Ctrl+Shift+L)`}
            onClick={props.onToggleLayout}
          >
            {props.layout === 'horizontal' ? <PanelLeft size={18} /> : <PanelTop size={18} />}
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
            <Keyboard size={18} />
          </button>
        </Show>
      </div>
    </nav>
  )
}
