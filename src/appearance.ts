import { createEffect, createSignal, onCleanup } from 'solid-js'

export const THEMES = [
  { id: 'sumi', label: 'Sumi' },
  { id: 'solarized', label: 'Solarized' },
  { id: 'github', label: 'GitHub' },
  { id: 'one', label: 'One' },
  { id: 'gruvbox', label: 'Gruvbox' },
  { id: 'catppuccin', label: 'Catppuccin' },
] as const

export type ThemeId = (typeof THEMES)[number]['id']
export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedMode = 'light' | 'dark'

// The inline script in index.html reads the same keys to avoid a flash before this module loads.
const THEME_KEY = 'sumi:theme'
const MODE_KEY = 'sumi:theme-mode'
const LINES_KEY = 'sumi:line-numbers'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function read(key: string) {
  try { return localStorage.getItem(key) } catch { return null }
}

function loadTheme(): ThemeId {
  const stored = read(THEME_KEY)
  return THEMES.find((theme) => theme.id === stored)?.id ?? 'sumi'
}

function loadMode(): ThemeMode {
  const stored = read(MODE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

export function createAppearance() {
  const systemDark = window.matchMedia(DARK_QUERY)
  const [theme, setThemeSignal] = createSignal<ThemeId>(loadTheme())
  const [mode, setModeSignal] = createSignal<ThemeMode>(loadMode())
  const [systemIsDark, setSystemIsDark] = createSignal(systemDark.matches)
  const [lineNumbers, setLineNumbersSignal] = createSignal(read(LINES_KEY) === 'true')
  const [error, setError] = createSignal('')
  const resolved = (): ResolvedMode => (mode() === 'system' ? (systemIsDark() ? 'dark' : 'light') : (mode() as ResolvedMode))

  const onSystemChange = () => setSystemIsDark(systemDark.matches)
  systemDark.addEventListener('change', onSystemChange)
  onCleanup(() => systemDark.removeEventListener('change', onSystemChange))

  createEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme()
    root.dataset.mode = resolved()
    // Keep the browser chrome (address bar, installed-app title bar) in step with the editor.
    const background = getComputedStyle(root).getPropertyValue('--bg').trim()
    if (background) document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', background))
  })

  function persist(key: string, value: string, message: string) {
    try { localStorage.setItem(key, value); setError('') }
    catch { setError(message) }
  }
  const message = 'Appearance could not be remembered on this device.'
  return {
    theme,
    mode,
    resolved,
    lineNumbers,
    error,
    setTheme(next: ThemeId) { setThemeSignal(next); persist(THEME_KEY, next, message) },
    setMode(next: ThemeMode) { setModeSignal(next); persist(MODE_KEY, next, message) },
    setLineNumbers(next: boolean) { setLineNumbersSignal(next); persist(LINES_KEY, String(next), 'Line numbers could not be remembered on this device.') },
  }
}

export type Appearance = ReturnType<typeof createAppearance>
