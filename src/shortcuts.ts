type ShortcutAction = 'new' | 'close' | 'previous' | 'next' | 'jump' | 'layout' | 'help'

interface Shortcut {
  action: ShortcutAction
  label: string
  altCode: string
  altLabel: string
  altShift?: boolean
  ctrlShiftCode?: string
  ctrlShiftLabel?: string
  repeatable?: boolean
}

// The help panel and event handler share these definitions.
export const shortcuts: Shortcut[] = [
  { action: 'new', label: 'New tab', altCode: 'KeyN', altLabel: 'Alt+N', ctrlShiftCode: 'Enter', ctrlShiftLabel: 'Ctrl+Shift+Enter' },
  { action: 'close', label: 'Close tab', altCode: 'KeyW', altLabel: 'Alt+W', ctrlShiftCode: 'Backspace', ctrlShiftLabel: 'Ctrl+Shift+Backspace' },
  { action: 'previous', label: 'Previous tab', altCode: 'BracketLeft', altLabel: 'Alt+[', ctrlShiftCode: 'Comma', ctrlShiftLabel: 'Ctrl+Shift+,', repeatable: true },
  { action: 'next', label: 'Next tab', altCode: 'BracketRight', altLabel: 'Alt+]', ctrlShiftCode: 'Period', ctrlShiftLabel: 'Ctrl+Shift+.', repeatable: true },
  { action: 'jump', label: 'Jump to tab 1–9', altCode: 'Digit1-9', altLabel: 'Alt+1…9', repeatable: true },
  { action: 'layout', label: 'Toggle tab layout', altCode: 'KeyL', altLabel: 'Alt+Shift+L', altShift: true, ctrlShiftCode: 'KeyL', ctrlShiftLabel: 'Ctrl+Shift+L' },
  { action: 'help', label: 'Keyboard shortcuts', altCode: 'Slash', altLabel: 'Alt+/', ctrlShiftCode: 'Slash', ctrlShiftLabel: 'Ctrl+Shift+/' },
]

function shortcutCode(e: KeyboardEvent) {
  // Preserve physical-key matching for Option dead keys on macOS, but accept
  // key-only events from keyboards/browsers that omit the physical code.
  if (e.code && e.code !== 'Unidentified') return e.code
  const key = e.key.toLowerCase()
  if (/^[a-z]$/.test(key)) return `Key${key.toUpperCase()}`
  if (/^[1-9]$/.test(key)) return `Digit${key}`
  if (key === '[') return 'BracketLeft'
  if (key === ']') return 'BracketRight'
  if (key === '/' || key === '?') return 'Slash'
  if (key === ',' || key === '<') return 'Comma'
  if (key === '.' || key === '>') return 'Period'
  return e.key
}

export function matchShortcut(e: KeyboardEvent) {
  if (e.isComposing || e.key === 'Process' || e.metaKey || e.getModifierState('AltGraph')) return
  const alt = e.altKey && !e.ctrlKey
  const ctrlShift = e.ctrlKey && e.shiftKey && !e.altKey
  if (!alt && !ctrlShift) return
  const code = shortcutCode(e)
  const shortcut = shortcuts.find((shortcut) =>
    alt
      ? e.shiftKey === !!shortcut.altShift && (shortcut.altCode === code || (shortcut.action === 'jump' && /^Digit[1-9]$/.test(code)))
      : shortcut.ctrlShiftCode === code,
  )
  if (shortcut) return { ...shortcut, index: Number(code.slice(5)) - 1 }
}
