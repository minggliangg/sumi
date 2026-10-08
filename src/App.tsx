import { createSignal, onCleanup, onMount } from 'solid-js'
import Editor, { type Cursor } from './components/Editor.tsx'
import TabBar, { type TabLayout } from './components/TabBar.tsx'
import StatusBar from './components/StatusBar.tsx'
import { createTabs } from './tabs/tabs.ts'

const LAYOUT_KEY = 'sumi:tab-layout'

function loadLayout(): TabLayout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'vertical' ? 'vertical' : 'horizontal'
  } catch {
    return 'horizontal'
  }
}

export default function App() {
  const tabs = createTabs()
  const [cursor, setCursor] = createSignal<Cursor>({ line: 1, col: 1, selected: 0 })
  const [layout, setLayout] = createSignal<TabLayout>(loadLayout())

  function toggleLayout() {
    const next = layout() === 'horizontal' ? 'vertical' : 'horizontal'
    setLayout(next)
    try {
      localStorage.setItem(LAYOUT_KEY, next)
    } catch {
      // Storage unavailable; the choice just won't persist.
    }
  }

  // Alt-based shortcuts: Ctrl/Cmd+T/W/Tab are reserved by the browser.
  // Match on `code` so macOS Option dead keys don't interfere.
  function onKeyDown(e: KeyboardEvent) {
    if (!e.altKey || e.ctrlKey || e.metaKey) return
    let handled = true
    if (e.shiftKey && e.code === 'KeyL') toggleLayout()
    else if (e.shiftKey) handled = false
    else if (e.code === 'KeyN') tabs.open()
    else if (e.code === 'KeyW') tabs.close(tabs.activeId())
    else if (e.code === 'BracketLeft') tabs.cycle(-1)
    else if (e.code === 'BracketRight') tabs.cycle(1)
    else if (/^Digit[1-9]$/.test(e.code)) tabs.selectIndex(Number(e.code.slice(5)) - 1)
    else handled = false
    if (handled) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  onMount(() => window.addEventListener('keydown', onKeyDown, { capture: true }))
  onCleanup(() => window.removeEventListener('keydown', onKeyDown, { capture: true }))

  return (
    <main class="app" data-tab-layout={layout()}>
      <TabBar tabs={tabs} layout={layout()} onToggleLayout={toggleLayout} />
      <Editor tabs={tabs} onCursor={setCursor} />
      <StatusBar cursor={cursor()} />
    </main>
  )
}
