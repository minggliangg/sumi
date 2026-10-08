import { createEffect, For, onCleanup } from 'solid-js'
import type { Tabs } from '../tabs/tabs.ts'

export type TabLayout = 'horizontal' | 'vertical'

interface Props {
  tabs: Tabs
  layout: TabLayout
  onToggleLayout: () => void
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
                  title={tab.title}
                  onClick={() => props.tabs.select(tab.id)}
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
        <button type="button" class="tabbar-button" aria-label="New tab" title="New tab (Alt+N)" onClick={() => props.tabs.open()}>
          +
        </button>
        <button
          type="button"
          class="tabbar-button"
          aria-label="Toggle tab layout"
          title="Toggle tab layout (Alt+Shift+L)"
          onClick={props.onToggleLayout}
        >
          {props.layout === 'horizontal' ? '⫼' : '☰'}
        </button>
      </div>
    </nav>
  )
}
