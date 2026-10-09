import { createSignal, onCleanup, onMount } from 'solid-js'
import { registerSW } from 'virtual:pwa-register'

export function createAppUpdate(hasContent: () => boolean) {
  const [available, setAvailable] = createSignal(false)
  const [updating, setUpdating] = createSignal(false)
  const [error, setError] = createSignal('')
  let registration: ServiceWorkerRegistration | undefined
  let activate: (() => Promise<void>) | undefined
  let readyToReload = false
  let hadController = false
  let reloadStarted = false
  let disposed = false
  let checking = false
  let timeout: ReturnType<typeof setTimeout> | undefined

  function reload() {
    if (reloadStarted) return
    reloadStarted = true
    clearTimeout(timeout)
    window.location.reload()
  }

  function onReadyToReload() {
    if (disposed) return
    readyToReload = true
    setAvailable(true)
    // Another window may activate the worker. Never reload this window
    // unless its user has explicitly approved updating its documents.
    if (updating()) reload()
  }

  function onControllerChange() {
    // First installation claiming this page is not an app update.
    if (hadController || available()) onReadyToReload()
    hadController = !!navigator.serviceWorker.controller
  }

  function fail() {
    clearTimeout(timeout)
    setUpdating(false)
    setError('Update could not finish. Please try again.')
  }

  async function check() {
    if (disposed || checking || !registration || !navigator.onLine) return
    checking = true
    try {
      await registration.update()
    } catch {
      // A failed background check must not interrupt writing.
    } finally {
      checking = false
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') void check()
  }

  async function apply() {
    if (!available() || updating() || !activate) return
    if (hasContent() && !window.confirm(
      'Update sumi and discard the text in all tabs in this window? Text is not saved yet. Copy anything you want to keep before continuing.',
    )) return
    setError('')
    setUpdating(true)
    if (readyToReload && !registration?.waiting) {
      reload()
      return
    }
    // If activation stalls, restore writing and require another explicit click.
    timeout = setTimeout(fail, 15000)
    try {
      await activate()
    } catch {
      if (!disposed) fail()
    }
  }

  onMount(() => {
    if (!('serviceWorker' in navigator)) return
    hadController = !!navigator.serviceWorker.controller
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    activate = registerSW({
      immediate: true,
      onNeedRefresh() {
        if (!disposed) setAvailable(true)
      },
      onNeedReload: onReadyToReload,
      onRegisteredSW(_url, next) {
        if (disposed) return
        registration = next
        void check()
      },
    })
    window.addEventListener('focus', check)
    window.addEventListener('online', check)
    document.addEventListener('visibilitychange', onVisibilityChange)
  })
  onCleanup(() => {
    disposed = true
    clearTimeout(timeout)
    navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange)
    window.removeEventListener('focus', check)
    window.removeEventListener('online', check)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  return { available, updating, error, apply }
}
