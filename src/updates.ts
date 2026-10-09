import { createSignal, onCleanup, onMount } from 'solid-js'
import { registerSW } from 'virtual:pwa-register'

export function createAppUpdate(preserve: () => Promise<void>) {
  const [available, setAvailable] = createSignal(false)
  const [updating, setUpdating] = createSignal(false)
  const [error, setError] = createSignal('')
  const [checkingUpdate, setCheckingUpdate] = createSignal(false)
  const [checkMessage, setCheckMessage] = createSignal('')
  let registration: ServiceWorkerRegistration | undefined
  let activate: (() => Promise<void>) | undefined
  let readyToReload = false
  let hadController = false
  let reloadStarted = false
  let preserved = false
  let disposed = false
  let checking = false
  let timeout: ReturnType<typeof setTimeout> | undefined

  function reload() {
    if (reloadStarted) return
    reloadStarted = true
    clearTimeout(timeout)
    void preserve().then(() => window.location.reload(), () => {
      reloadStarted = false
      preserved = false
      setUpdating(false)
      setError('Update paused because drafts could not be saved. Export a copy or retry saving first.')
    })
  }

  function onReadyToReload() {
    if (disposed) return
    readyToReload = true
    setAvailable(true)
    if (checkMessage()) setCheckMessage('An update is ready to install.')
    // Another window may activate the worker. Never reload this window
    // unless its user has explicitly approved updating its documents.
    if (updating() && preserved) reload()
  }

  function onControllerChange() {
    // First installation claiming this page is not an app update.
    if (hadController || available()) onReadyToReload()
    hadController = !!navigator.serviceWorker.controller
  }

  function fail() {
    clearTimeout(timeout)
    setUpdating(false)
    preserved = false
    setError('Update could not finish. Please try again.')
  }

  async function check() {
    if (disposed || checking || !registration || !navigator.onLine) return
    checking = true
    setCheckingUpdate(true)
    try {
      await registration.update()
    } catch {
      // A failed background check must not interrupt writing.
    } finally {
      checking = false
      if (!disposed) setCheckingUpdate(false)
    }
  }

  async function checkForUpdates() {
    if (disposed) return
    setCheckMessage('')
    if (!('serviceWorker' in navigator)) {
      setCheckMessage('Updates are unavailable in this browser.')
      return
    }
    if (!navigator.onLine) {
      setCheckMessage('Connect to the internet to check for updates.')
      return
    }
    if (!registration) {
      setCheckMessage('Update checking is still starting. Try again shortly.')
      return
    }
    if (checking) {
      setCheckMessage('An update check is already in progress.')
      return
    }

    checking = true
    setCheckingUpdate(true)
    try {
      await registration.update()
      if (registration.waiting || readyToReload || available()) {
        // A waiting worker may predate this explicit check. Surface it even if
        // the registration callback did not report it in this page session.
        onReadyToReload()
        setCheckMessage('An update is ready to install.')
      } else if (registration.installing) {
        setCheckMessage('An update is downloading. It will appear when ready.')
      } else {
        setCheckMessage('This version is up to date.')
      }
    } catch {
      if (registration.waiting) {
        onReadyToReload()
        setCheckMessage('Could not check for a newer version. An update is ready to install.')
      } else {
        setCheckMessage('Could not check for updates. Check your connection and try again.')
      }
    } finally {
      checking = false
      if (!disposed) setCheckingUpdate(false)
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') void check()
  }

  async function apply() {
    if (!available() || updating() || !activate) return
    setError('')
    setUpdating(true)
    try { await preserve() } catch {
      setUpdating(false)
      setError('Update paused because drafts could not be saved. Export a copy or retry saving first.')
      return
    }
    preserved = true
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
        if (!disposed) {
          setAvailable(true)
          if (checkMessage()) setCheckMessage('An update is ready to install.')
        }
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

  return { available, updating, error, checking: checkingUpdate, checkMessage, check: checkForUpdates, apply }
}
