import { createSignal, onCleanup, onMount } from 'solid-js'
import Editor, { type Cursor } from './components/Editor.tsx'
import TabBar, { type TabLayout } from './components/TabBar.tsx'
import StatusBar from './components/StatusBar.tsx'
import ShortcutHelp from './components/ShortcutHelp.tsx'
import { matchShortcut } from './shortcuts.ts'
import { createTabs } from './tabs/tabs.ts'
import { createAppUpdate } from './updates.ts'

const LAYOUT_KEY = 'sumi:tab-layout'

function loadLayout(): TabLayout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'vertical' ? 'vertical' : 'horizontal'
  } catch {
    return 'horizontal'
  }
}

export default function App() {
  const tabs = createTabs((state) =>
    state.doc.length === 0 || window.confirm('Close this tab and discard its text? Text is not saved yet.'),
  )
  const [cursor, setCursor] = createSignal<Cursor>({ line: 1, col: 1, selected: 0 })
  const [layout, setLayout] = createSignal<TabLayout>(loadLayout())
  const [showShortcuts, setShowShortcuts] = createSignal(false)
  const update = createAppUpdate(tabs.hasContent)

  function toggleLayout() {
    const next = layout() === 'horizontal' ? 'vertical' : 'horizontal'
    setLayout(next)
    try {
      localStorage.setItem(LAYOUT_KEY, next)
    } catch {
      // Storage unavailable; the choice just won't persist.
    }
  }

  // Capture app shortcuts before CodeMirror handles editing commands.
  function onKeyDown(e: KeyboardEvent) {
    if (update.updating()) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (showShortcuts() || document.querySelector('dialog[open]')) return
    const shortcut = matchShortcut(e)
    if (!shortcut) return
    e.preventDefault()
    e.stopPropagation()
    if (e.repeat && !shortcut.repeatable) return
    switch (shortcut.action) {
      case 'new': tabs.open(); break
      case 'close': tabs.close(tabs.activeId()); break
      case 'previous': tabs.cycle(-1); break
      case 'next': tabs.cycle(1); break
      case 'jump': tabs.selectIndex(shortcut.index); break
      case 'layout': toggleLayout(); break
      case 'help': setShowShortcuts(true); break
    }
  }

  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (update.updating() || !tabs.hasContent()) return
    e.preventDefault()
    e.returnValue = ''
  }

  onMount(() => {
    window.addEventListener('keydown', onKeyDown, { capture: true })
    window.addEventListener('beforeunload', onBeforeUnload)
  })
  onCleanup(() => {
    window.removeEventListener('keydown', onKeyDown, { capture: true })
    window.removeEventListener('beforeunload', onBeforeUnload)
  })

  return (
    <main class="app" data-tab-layout={layout()} inert={update.updating()} aria-busy={update.updating()}>
      <TabBar
        tabs={tabs}
        layout={layout()}
        onToggleLayout={toggleLayout}
        onShowShortcuts={() => setShowShortcuts(true)}
        shortcutsOpen={showShortcuts()}
      />
      <Editor tabs={tabs} onCursor={setCursor} />
      <StatusBar cursor={cursor()} update={update} tabs={tabs} />
      <ShortcutHelp open={showShortcuts()} onClose={() => setShowShortcuts(false)} />
    </main>
  )
}
