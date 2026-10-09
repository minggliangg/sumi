import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import { Check, ChevronDown, X } from 'lucide-solid'
import { languageOptions, type LanguageMode } from '../editor/languages.ts'
import type { Tabs } from '../tabs/tabs.ts'

export default function LanguagePicker(props: { tabs: Tabs }) {
  let trigger!: HTMLButtonElement
  let dialog!: HTMLDialogElement
  let search!: HTMLInputElement
  const [query, setQuery] = createSignal('')
  const active = createMemo(() => props.tabs.tabs.find((tab) => tab.id === props.tabs.activeId()))
  const options = [{ id: 'auto' as LanguageMode, label: 'Auto' }, { id: 'plain' as LanguageMode, label: 'Plain text' }, ...languageOptions]
  const filtered = createMemo(() => options.filter((option) => option.label.toLowerCase().includes(query().trim().toLowerCase())))
  const label = createMemo(() => {
    const tab = active()
    if (!tab) return 'Auto · Plain text'
    if (tab.languageStatus === 'large') return 'Large document · Plain text'
    const language = languageOptions.find((option) => option.id === tab.resolvedLanguage)?.label ?? 'Plain text'
    const chosen = options.find((option) => option.id === tab.languageMode)?.label ?? 'Auto'
    const text = tab.languageMode === 'auto' ? `Auto · ${language}` : chosen
    return tab.languageStatus === 'loading' ? `${text} · Loading…` : text
  })
  function close() {
    if (dialog.open) dialog.close()
    trigger.focus()
  }
  function open() {
    setQuery('')
    dialog.showModal()
    search.focus()
  }
  function choose(mode: LanguageMode) {
    const tab = active()
    if (tab) props.tabs.setLanguage(tab.id, mode)
    close()
  }
  onCleanup(() => { if (dialog.open) dialog.close() })
  return (
    <>
      <button ref={trigger} type="button" class="language-button" aria-label="Choose language" data-language={active()?.resolvedLanguage ?? 'plain'} data-language-mode={active()?.languageMode ?? 'auto'} data-language-status={active()?.languageStatus ?? 'plain'} aria-haspopup="dialog" onClick={open}>
        <span>{label()}</span>
        <ChevronDown size={13} />
      </button>
      <Show when={active()?.languageStatus === 'error'}>
        <span role="status">Language unavailable</span>
        <button type="button" class="language-retry" onClick={() => { const tab = active(); if (tab) props.tabs.retryLanguage(tab.id) }}>Retry</button>
      </Show>
      <dialog ref={dialog} class="dialog language-picker" aria-labelledby="language-picker-title" onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
      }} onCancel={(event) => { event.preventDefault(); close() }}>
        <div class="shortcut-heading">
          <h1 id="language-picker-title">Language</h1>
          <button type="button" class="tabbar-button" aria-label="Close language picker" onClick={close}><X size={18} /></button>
        </div>
        <input ref={search} class="language-search" type="search" aria-label="Search languages" placeholder="Search languages…" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            dialog.querySelector<HTMLButtonElement>('.language-option')?.focus()
          } else if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && filtered().length === 1) {
            event.preventDefault()
            choose(filtered()[0].id)
          }
        }} />
        <div class="language-options" onKeyDown={(event) => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
          const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('.language-option'))
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
          if (!buttons.length || index < 0) return
          event.preventDefault()
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
          buttons[next].focus()
        }}>
          <For each={filtered()}>{(option) => <button type="button" class="language-option" aria-pressed={active()?.languageMode === option.id} onClick={() => choose(option.id)}><span>{option.label}</span><Show when={active()?.languageMode === option.id}><Check size={14} /></Show></button>}</For>
          <Show when={filtered().length === 0}><span class="language-empty">No matching languages</span></Show>
        </div>
      </dialog>
    </>
  )
}
