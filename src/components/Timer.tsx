import { createSignal, onCleanup, Show } from 'solid-js'
import { Timer as TimerIcon, X } from 'lucide-solid'
import CountdownRipple from './CountdownRipple.tsx'

type Mode = 'stopwatch' | 'countdown'
type Status = 'idle' | 'running' | 'paused' | 'completed'

function formatTime(milliseconds: number, roundUp = false) {
  const seconds = Math.max(0, roundUp ? Math.ceil(milliseconds / 1000) : Math.floor(milliseconds / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function durationFromInputs(minutes: string, seconds: string) {
  if (!/^\d+$/.test(minutes) || !/^\d+$/.test(seconds)) return null
  const mins = Number(minutes)
  const secs = Number(seconds)
  if (!Number.isSafeInteger(mins) || mins < 0 || mins > 5999 || !Number.isSafeInteger(secs) || secs < 0 || secs > 59) return null
  const total = (mins * 60 + secs) * 1000
  return total > 0 ? total : null
}

export default function Timer() {
  let dialog!: HTMLDialogElement
  let trigger!: HTMLButtonElement
  let interval: ReturnType<typeof setInterval> | undefined
  let startedAt = 0
  let deadline = 0
  let accumulated = 0

  const [mode, setMode] = createSignal<Mode>('stopwatch')
  const [status, setStatus] = createSignal<Status>('idle')
  const [displayMs, setDisplayMs] = createSignal(0)
  const [minutes, setMinutes] = createSignal('5')
  const [seconds, setSeconds] = createSignal('0')
  const [rippleTarget, setRippleTarget] = createSignal<'footer' | 'dialog' | null>(null)
  const configuredDuration = () => durationFromInputs(minutes(), seconds())
  const shownMs = () => status() === 'idle' && mode() === 'countdown' ? configuredDuration() ?? 0 : displayMs()
  const timeText = () => formatTime(shownMs(), mode() === 'countdown')
  const durationError = () => mode() === 'countdown' && configuredDuration() === null
    ? 'Enter a duration greater than zero, with whole minutes and seconds from 0 to 59.'
    : ''

  function stopTicking() {
    if (interval !== undefined) clearInterval(interval)
    interval = undefined
  }

  function refresh() {
    if (status() !== 'running') return
    if (mode() === 'stopwatch') {
      setDisplayMs(accumulated + Date.now() - startedAt)
      return
    }
    const remaining = Math.max(0, deadline - Date.now())
    setDisplayMs(remaining)
    if (remaining === 0) {
      stopTicking()
      setStatus('completed')
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && !document.hidden) {
        setRippleTarget(dialog.open ? 'dialog' : 'footer')
      }
    }
  }

  function startTicking() {
    stopTicking()
    interval = setInterval(refresh, 100)
  }

  function start() {
    accumulated = 0
    if (mode() === 'stopwatch') {
      startedAt = Date.now()
      setDisplayMs(0)
    } else {
      const duration = configuredDuration()
      if (duration === null) return
      deadline = Date.now() + duration
      setDisplayMs(duration)
    }
    setStatus('running')
    startTicking()
  }

  function pause() {
    refresh()
    if (status() !== 'running') return
    accumulated = displayMs()
    stopTicking()
    setStatus('paused')
  }

  function resume() {
    if (mode() === 'stopwatch') startedAt = Date.now()
    else deadline = Date.now() + displayMs()
    setStatus('running')
    startTicking()
  }

  function reset() {
    setRippleTarget(null)
    stopTicking()
    accumulated = 0
    startedAt = 0
    deadline = 0
    setDisplayMs(0)
    setStatus('idle')
  }

  function closeDialog() {
    if (dialog.open) dialog.close()
    trigger.focus()
  }

  onCleanup(() => {
    stopTicking()
    if (dialog.open) dialog.close()
  })

  return <>
    <button
      ref={trigger}
      type="button"
      class="status-button timer-button"
      aria-label="Timer"
      aria-haspopup="dialog"
      aria-controls="timer-dialog"
      aria-description={`${mode() === 'stopwatch' ? 'Stopwatch' : 'Countdown'}${status() === 'idle' ? '' : `, ${timeText()}, ${status()}`}`}
      data-finished={status() === 'completed'}
      title={`${mode() === 'stopwatch' ? 'Stopwatch' : 'Countdown'}${status() === 'idle' ? '' : ` · ${timeText()} · ${status()}`}`}
      onClick={() => dialog.showModal()}
    >
      <TimerIcon size={14} />
      <span class="status-label">Timer</span>
      {status() !== 'idle' && <span class="timer-display" id="timer-trigger-time">{timeText()}</span>}
      <Show when={rippleTarget() === 'footer'}><CountdownRipple onDone={() => setRippleTarget(null)} /></Show>
    </button>
    <Show when={status() === 'completed'}>
      <div class="timer-completion-row">
        <span class="timer-completion" role="status">Time’s up</span>
        <button type="button" class="timer-dismiss" onClick={() => { reset(); trigger.focus() }}>Dismiss</button>
      </div>
    </Show>
    <dialog
      ref={dialog}
      id="timer-dialog"
      class="dialog timer-dialog"
      aria-labelledby="timer-title"
      onCancel={event => {
        event.preventDefault()
        closeDialog()
      }}
      onClose={() => {
        // Native close events are queued; only restore focus when this dialog stays closed.
        if (!dialog.open) trigger.focus()
      }}
    >
      <div class="shortcut-heading">
        <h1 id="timer-title">Timer</h1>
        <button type="button" class="tabbar-button" aria-label="Close timer" onClick={closeDialog} autofocus><X size={18} /></button>
      </div>

      <div class="segmented" role="group" aria-label="Timer mode">
        <button type="button" class="segment" aria-pressed={mode() === 'stopwatch'} disabled={status() !== 'idle'} onClick={() => setMode('stopwatch')}>Stopwatch</button>
        <button type="button" class="segment" aria-pressed={mode() === 'countdown'} disabled={status() !== 'idle'} onClick={() => setMode('countdown')}>Countdown</button>
      </div>

      <div class="timer-readout">
        <output class="time-display" aria-label={`${mode()} time`} aria-live="off">{timeText()}</output>
        <Show when={rippleTarget() === 'dialog'}><CountdownRipple onDone={() => setRippleTarget(null)} /></Show>
      </div>

      {mode() === 'countdown' && <div class="duration-inputs">
        <label for="timer-minutes">Minutes
          <input id="timer-minutes" type="number" min="0" max="5999" step="1" inputmode="numeric" value={minutes()} disabled={status() !== 'idle'} aria-invalid={!!durationError()} aria-describedby="timer-duration-help" onInput={event => setMinutes(event.currentTarget.value)} />
        </label>
        <label for="timer-seconds">Seconds
          <input id="timer-seconds" type="number" min="0" max="59" step="1" inputmode="numeric" value={seconds()} disabled={status() !== 'idle'} aria-invalid={!!durationError()} aria-describedby="timer-duration-help" onInput={event => setSeconds(event.currentTarget.value)} />
        </label>
      </div>}
      {status() !== 'idle' && <p class="timer-note">Reset to change modes or edit the countdown duration.</p>}
      {mode() === 'countdown' && <p id="timer-duration-help" class="timer-error" role="status">{durationError()}</p>}

      <div class="timer-actions">
        <button
          type="button"
          class="settings-action"
          disabled={status() === 'idle' && mode() === 'countdown' && !!durationError()}
          aria-disabled={status() === 'completed'}
          onClick={() => {
            if (status() === 'idle') start()
            else if (status() === 'running') pause()
            else if (status() === 'paused') resume()
          }}
        >
          {status() === 'running' ? 'Pause' : status() === 'paused' ? 'Resume' : status() === 'completed' ? 'Completed' : 'Start'}
        </button>
        <button type="button" class="settings-action" onClick={reset}>Reset</button>
      </div>
    </dialog>
  </>
}
