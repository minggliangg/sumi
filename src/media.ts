import { createSignal, onCleanup } from 'solid-js'

export function createMediaQuery(query: string) {
  const list = window.matchMedia(query)
  const [matches, setMatches] = createSignal(list.matches)
  const update = () => setMatches(list.matches)
  list.addEventListener('change', update)
  onCleanup(() => list.removeEventListener('change', update))
  return matches
}

// Phones and narrow windows: secondary actions move into a menu and the
// vertical tab list becomes a drawer.
export const COMPACT_QUERY = '(max-width: 640px)'
