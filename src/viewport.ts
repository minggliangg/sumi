import { onCleanup, onMount } from 'solid-js'

// Safari does not resize the layout viewport for the on-screen keyboard, and with a hardware
// keyboard attached it floats a shortcut bar over the bottom of the page. Both only shrink the
// visual viewport, so keep the layout clear of whatever covers its bottom edge. The page cannot
// query or hide that bar; it can only react to the viewport it leaves behind.
export function createViewportInset() {
  onMount(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const root = document.documentElement
    let frame = 0
    const apply = () => {
      frame = 0
      // A pinch-zoomed viewport is smaller too, but nothing is covering the page then.
      const covered = viewport.scale > 1.01 ? 0 : window.innerHeight - viewport.height - viewport.offsetTop
      root.style.setProperty('--viewport-inset-bottom', `${Math.max(0, Math.round(covered))}px`)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(apply) }
    viewport.addEventListener('resize', schedule)
    viewport.addEventListener('scroll', schedule)
    apply()
    onCleanup(() => {
      viewport.removeEventListener('resize', schedule)
      viewport.removeEventListener('scroll', schedule)
      if (frame) cancelAnimationFrame(frame)
      root.style.removeProperty('--viewport-inset-bottom')
    })
  })
}
