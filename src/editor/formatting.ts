import { prepareAssets, waitForWorker, type LanguageId } from './languages.ts'
import type { FormatChange } from './format.worker.ts'

export interface FormatJob { promise: Promise<FormatChange[]>; cancel(): void }
export function requestFormat(language: LanguageId, source: string): FormatJob {
  let worker: Worker | undefined
  let cancelled = false
  let rejectJob!: (reason: Error) => void
  let timeout: ReturnType<typeof setTimeout> | undefined
  const pack = language === 'python' ? ['python'] : language === 'sql' ? ['sql']
    : ['prettier', ...(['javascript', 'jsx', 'json'].includes(language) ? ['babel', 'estree']
      : ['typescript', 'tsx'].includes(language) ? ['typescript', 'estree']
        : language === 'css' ? ['postcss'] : [language])]
  const clean = () => { clearTimeout(timeout); worker?.terminate() }
  const promise = new Promise<FormatChange[]>((resolve, reject) => {
    rejectJob = reject
    timeout = setTimeout(() => { cancelled = true; clean(); reject(new Error('Formatting took too long. Try a smaller document.')) }, 30000)
    void waitForWorker().then(() => Promise.all(['worker', ...pack].map(id => prepareAssets('formatterPacks', id)))).then(() => {
      if (cancelled) return
      worker = new Worker(new URL('./format.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = ({ data }: MessageEvent<{ changes?: FormatChange[]; error?: string }>) => {
        clean()
        if (data.error) reject(new Error(data.error))
        else resolve(data.changes ?? [])
      }
      worker.onerror = event => { event.preventDefault(); clean(); reject(new Error('Formatter unavailable. Try again when online.')) }
      worker.onmessageerror = () => { clean(); reject(new Error('Formatter response could not be read. Try again.')) }
      worker.postMessage({ language, source })
    }).catch(() => { clean(); reject(new Error('Formatter unavailable. Try again when online.')) })
  })
  return { promise, cancel() { cancelled = true; clean(); rejectJob(new Error('Formatting cancelled')) } }
}
