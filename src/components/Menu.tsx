import { createSignal, For, onCleanup, onMount, type Component } from 'solid-js'
import { Ellipsis } from 'lucide-solid'

export interface MenuItem {
  label: string
  icon: Component<{ size?: number; 'stroke-width'?: number }>
  onSelect: () => void
  disabled?: boolean
  expanded?: boolean
  controls?: string
}

// A small action menu: arrow keys move, Escape closes and restores focus.
export default function Menu(props: { label: string; items: MenuItem[]; disabled?: boolean }) {
  const [open, setOpen] = createSignal(false)
  let root!: HTMLDivElement
  let trigger!: HTMLButtonElement
  let list!: HTMLDivElement

  const enabled = () => Array.from(list.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))

  function close(restoreFocus = true) {
    setOpen(false)
    if (restoreFocus) trigger.focus()
  }

  function toggle(event: MouseEvent) {
    const next = !open()
    setOpen(next)
    // detail is 0 for keyboard activation; pointer users keep focus on the trigger, arrows still work.
    if (next && event.detail === 0) queueMicrotask(() => enabled()[0]?.focus())
  }

  function onPointerDown(event: PointerEvent) {
    if (open() && !root.contains(event.target as Node)) close(false)
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!open()) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
    if (event.key === 'Tab') { close(false); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = enabled()
    if (!items.length) return
    event.preventDefault()
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next].focus()
  }

  onMount(() => {
    document.addEventListener('pointerdown', onPointerDown)
    // Capture so Escape closes the menu before the app's global handlers see it.
    root.addEventListener('keydown', onKeyDown, { capture: true })
  })
  onCleanup(() => {
    document.removeEventListener('pointerdown', onPointerDown)
    root.removeEventListener('keydown', onKeyDown, { capture: true })
  })

  return (
    <div class="menu" ref={root}>
      <button ref={trigger} type="button" class="tabbar-button" aria-label={props.label} title={props.label} aria-haspopup="menu" aria-expanded={open()} disabled={props.disabled} onClick={toggle}>
        <Ellipsis size={18} />
      </button>
      <div ref={list} class="menu-list" role="menu" aria-label={props.label} hidden={!open()}>
        <For each={props.items}>{(item) => (
          <button
            type="button"
            role="menuitem"
            class="menu-item"
            disabled={item.disabled}
            aria-haspopup={item.controls ? 'dialog' : undefined}
            aria-controls={item.controls}
            aria-expanded={item.expanded}
            // Focus returns to the trigger first so dialogs opened here restore focus to it.
            onClick={() => { close(); item.onSelect() }}
          >
            <item.icon size={16} />
            <span>{item.label}</span>
          </button>
        )}</For>
      </div>
    </div>
  )
}
