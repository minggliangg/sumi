import { createFontSize } from './editor/font-size.ts'
import { createAppearance } from './appearance.ts'
import Recovery from './components/Recovery.tsx'
import { createRecovery } from './storage/recovery.ts'
import { exportFilename, languageForFilename, readImportedFile } from './editor/files.ts'
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import EditorArea from './components/EditorArea.tsx'
import type { Cursor } from './components/Editor.tsx'
import TabBar, { type TabLayout } from './components/TabBar.tsx'
import StatusBar from './components/StatusBar.tsx'
import ShortcutHelp from './components/ShortcutHelp.tsx'
import { matchShortcut } from './shortcuts.ts'
import { createTabs } from './tabs/tabs.ts'
import { createAppUpdate } from './updates.ts'
import { COMPACT_QUERY, createMediaQuery } from './media.ts'

const LAYOUT_KEY = 'sumi:tab-layout'
const TABS_HIDDEN_KEY = 'sumi:tabs-hidden'

function loadLayout(): TabLayout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'vertical' ? 'vertical' : 'horizontal'
  } catch {
    return 'horizontal'
  }
}

function loadTabsHidden(): boolean {
  try {
    return localStorage.getItem(TABS_HIDDEN_KEY) === 'true'
  } catch {
    return false
  }
}

export default function App() {
  const font = createFontSize()
  const appearance = createAppearance()
  const model = createTabs()
  const persistence = createRecovery(model)
  const tabs = { ...model, ...persistence }
  const [recoveryOpen, setRecoveryOpen] = createSignal(false)
  const [fileError, setFileError] = createSignal('')
  let importInput!: HTMLInputElement
  const exportUrls = new Map<string, ReturnType<typeof setTimeout>>()
  let disposed = false
  let importing: Promise<void> = Promise.resolve()
  async function importFiles(files: readonly File[]) {
    setFileError('')
    for (const file of Array.from(files)) {
      try {
        const text = await readImportedFile(file)
        if (disposed) return
        const id = tabs.open(text, file.name)
        const language = languageForFilename(file.name)
        if (language) tabs.setLanguage(id, language)
      } catch (error) { setFileError(error instanceof Error ? error.message : 'File could not be imported.') }
    }
    importInput.value = ''
  }
  function exportFile() {
    const tab = tabs.tabs.find(tab => tab.id === tabs.activeId())
    const session = tabs.session(tabs.activeId())
    if (!tab || !session) return
    const url = URL.createObjectURL(new Blob([session.state.doc.toString()], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = exportFilename(tab.title, tab.filename, tab.resolvedLanguage)
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    exportUrls.set(url, setTimeout(() => { URL.revokeObjectURL(url); exportUrls.delete(url) }, 60000))
  }
  const [cursor, setCursor] = createSignal<Cursor>({ line: 1, col: 1, selected: 0 })
  const [layout, setLayout] = createSignal<TabLayout>(loadLayout())
  const [tabsHidden, setTabsHidden] = createSignal(loadTabsHidden())
  // Session-only: the preview stays open across Markdown tabs until toggled off.
  const [previewOpen, setPreviewOpen] = createSignal(false)
  const markdown = () => tabs.tabs.find(tab => tab.id === tabs.activeId())?.resolvedLanguage === 'markdown'
  const compact = createMediaQuery(COMPACT_QUERY)
  // Phones already hide vertical tabs behind their drawer, so the sidebar toggle is desktop-only.
  const canHideTabs = () => layout() === 'vertical' && !compact()
  const [showShortcuts, setShowShortcuts] = createSignal(false)
  const update = createAppUpdate(async () => { await importing; tabs.cancelFormatting(); await tabs.flush() })

  function toggleLayout() {
    const next = layout() === 'horizontal' ? 'vertical' : 'horizontal'
    setLayout(next)
    try {
      localStorage.setItem(LAYOUT_KEY, next)
    } catch {
      // Storage unavailable; the choice just won't persist.
    }
  }

  function togglePreview() {
    if (!markdown()) return
    setPreviewOpen(!previewOpen())
  }

  function toggleTabs() {
    if (!canHideTabs()) return
    const next = !tabsHidden()
    setTabsHidden(next)
    try {
      localStorage.setItem(TABS_HIDDEN_KEY, String(next))
    } catch {
      // Storage unavailable; the choice just won't persist.
    }
  }

  // Capture app shortcuts before CodeMirror handles editing commands.
  function onKeyDown(e: KeyboardEvent) {
    if (!tabs.ready() || update.updating()) {
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
      case 'sidebar': toggleTabs(); break
      case 'preview': togglePreview(); break
      case 'lines': appearance.setLineNumbers(!appearance.lineNumbers()); break
      case 'format': void tabs.formatDocument(tabs.activeId()); break
      case 'help': setShowShortcuts(true); break
    }
  }

  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (!tabs.hasUnsaved()) return
    e.preventDefault()
    e.returnValue = ''
  }

  onMount(() => {
    window.addEventListener('keydown', onKeyDown, { capture: true })
    window.addEventListener('beforeunload', onBeforeUnload)
  })
  onCleanup(() => {
    disposed = true
    for (const [url, timer] of exportUrls) { clearTimeout(timer); URL.revokeObjectURL(url) }
    window.removeEventListener('keydown', onKeyDown, { capture: true })
    window.removeEventListener('beforeunload', onBeforeUnload)
  })

  return (
    <main class="app" style={{ '--editor-font-size': `${font.size()}px` }} data-tab-layout={layout()} data-tabs-hidden={tabsHidden() && canHideTabs()} data-line-numbers={appearance.lineNumbers()} inert={update.updating()} aria-busy={update.updating()}>
      <TabBar
        tabs={tabs}
        layout={layout()}
        onToggleLayout={toggleLayout}
        onShowShortcuts={() => setShowShortcuts(true)}
        shortcutsOpen={showShortcuts()}
        onRename={(id) => {
          const tab = tabs.tabs.find(tab => tab.id === id)
          if (!tab) return
          const name = window.prompt('Name this draft (leave blank to use its first line)', tab.filename ?? tab.title)
          if (name !== null) tabs.rename(id, name)
        }}
        onImport={() => importInput.click()}
        onExport={exportFile}
        onRecovery={() => setRecoveryOpen(true)}
        recoveryOpen={recoveryOpen()}
        actionsDisabled={!tabs.ready()}
      />
      <input ref={importInput} type="file" aria-label="Import files" multiple hidden onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); importing = importing.then(() => importFiles(files)) }} />
      <Show when={tabs.ready()} fallback={<div class="editor" role="status">Restoring drafts…</div>}>
        <EditorArea
          tabs={tabs}
          markdown={markdown()}
          previewOpen={previewOpen()}
          onTogglePreview={togglePreview}
          onClosePreview={() => setPreviewOpen(false)}
          onCursor={setCursor}
          fontSize={font.size()}
          lineNumbers={appearance.lineNumbers()}
        />
      </Show>
      <Show when={fileError()}><div class="file-error" role="status">{fileError()}</div></Show>
      <Recovery tabs={tabs} open={recoveryOpen()} onClose={() => setRecoveryOpen(false)} />
      <StatusBar cursor={cursor()} update={update} tabs={tabs} font={font} appearance={appearance} tabsToggle={{ available: canHideTabs(), hidden: tabsHidden(), toggle: toggleTabs }} />
      <ShortcutHelp open={showShortcuts()} onClose={() => setShowShortcuts(false)} />
    </main>
  )
}
