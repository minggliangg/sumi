import { createEffect, For } from 'solid-js'
import type { Tabs } from '../tabs/tabs.ts'

export type TabLayout = 'horizontal' | 'vertical'

interface Props {
  tabs: Tabs
  layout: TabLayout
  onToggleLayout: () => void
}

export default function TabBar(props: Props) {
  const refs = new Map<string, HTMLElement>()

  createEffect(() => {
    refs.get(props.tabs.activeId())?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })

  return (
    // preventDefault on mousedown keeps focus in the editor.
    <nav class="tabbar" onMouseDown={(e) => e.preventDefault()}>
      <div class="tabbar-list" role="tablist" aria-orientation={props.layout}>
        <For each={props.tabs.tabs}>
          {(tab) => (
            <div
              ref={(el) => refs.set(tab.id, el)}
              role="tab"
              class="tab"
              aria-selected={props.tabs.activeId() === tab.id}
              title={tab.title}
              onClick={() => props.tabs.select(tab.id)}
              onAuxClick={(e) => e.button === 1 && props.tabs.close(tab.id)}
            >
              <span class="tab-title">{tab.title}</span>
              <button
                class="tab-close"
                aria-label={`Close ${tab.title}`}
                onClick={(e) => {
                  e.stopPropagation()
                  refs.delete(tab.id)
                  props.tabs.close(tab.id)
                }}
              >
                ×
              </button>
            </div>
          )}
        </For>
      </div>
      <div class="tabbar-actions">
        <button class="tabbar-button" aria-label="New tab" title="New tab (Alt+N)" onClick={() => props.tabs.open()}>
          +
        </button>
        <button
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
