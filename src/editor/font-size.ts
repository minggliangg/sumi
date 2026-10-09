import { createSignal } from 'solid-js'

export const MIN_FONT_SIZE = 16
export const MAX_FONT_SIZE = 28
const KEY = 'sumi:font-size'
function normalized(value: number) {
  return Number.isFinite(value) ? Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(value))) : MIN_FONT_SIZE
}
function load() {
  try { return normalized(Number(localStorage.getItem(KEY) ?? MIN_FONT_SIZE)) }
  catch { return MIN_FONT_SIZE }
}
export function createFontSize() {
  const [size, setSize] = createSignal(load())
  const [error, setError] = createSignal('')
  function set(value: number) {
    const next = normalized(value)
    setSize(next)
    try { localStorage.setItem(KEY, String(next)); setError('') }
    catch { setError('Text size could not be remembered on this device.') }
  }
  return { size, set, error }
}
