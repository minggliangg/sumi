import type { Extension } from '@codemirror/state'

export const languageOptions = [
  { id: 'javascript', label: 'JavaScript' }, { id: 'typescript', label: 'TypeScript' },
  { id: 'jsx', label: 'JSX' }, { id: 'tsx', label: 'TSX' },
  { id: 'python', label: 'Python' }, { id: 'json', label: 'JSON' },
  { id: 'html', label: 'HTML' }, { id: 'css', label: 'CSS' },
  { id: 'markdown', label: 'Markdown' }, { id: 'sql', label: 'SQL' },
] as const
export type LanguageId = typeof languageOptions[number]['id']
export type LanguageMode = LanguageId | 'auto' | 'plain'
export type LanguageStatus = 'plain' | 'loading' | 'ready' | 'error' | 'large'

const loaders: Record<LanguageId, () => Promise<Extension>> = {
  javascript: () => import('@codemirror/lang-javascript').then(m => m.javascript()),
  typescript: () => import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true })),
  jsx: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true })),
  tsx: () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true, typescript: true })),
  python: () => import('@codemirror/lang-python').then(m => m.python()),
  json: () => import('@codemirror/lang-json').then(m => m.json()),
  html: () => import('@codemirror/lang-html').then(m => m.html()),
  css: () => import('@codemirror/lang-css').then(m => m.css()),
  markdown: () => import('@codemirror/lang-markdown').then(m => m.markdown()),
  sql: () => import('@codemirror/lang-sql').then(m => m.sql()),
}
// Let a first installation claim this page before requesting packs, so its
// runtime cache sees their entire dependency graph. Browser policy or a failed
// registration must never leave language loading waiting indefinitely.
let workerReady: Promise<void> | undefined
export function waitForWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || navigator.serviceWorker.controller) return Promise.resolve()
  if (!workerReady) workerReady = new Promise<void>(resolve => {
    const workers = navigator.serviceWorker
    const finish = () => {
      clearTimeout(timeout)
      workers.removeEventListener('controllerchange', claimed)
      resolve()
    }
    const claimed = () => { if (workers.controller) finish() }
    const timeout = setTimeout(finish, 2000)
    workers.addEventListener('controllerchange', claimed)
    claimed()
  })
  return workerReady
}

declare const __SUMI_LANGUAGE_MANIFEST__: string
interface LanguageAssets { languagePacks: Record<string, { files: string[] }>; formatterPacks: Record<string, { files: string[] }>; previewPacks: Record<string, { files: string[] }> }
let assets: Promise<LanguageAssets> | undefined
const prepared = new Map<string, Promise<void>>()
export async function prepareAssets(group: 'languagePacks' | 'formatterPacks' | 'previewPacks', pack: string) {
  if (!import.meta.env.PROD) return
  // Fetch every dependency before entering the browser's module map. Network
  // failures then remain retryable, and a controlling worker caches the files.
  if (!assets) {
    assets = fetch(`${import.meta.env.BASE_URL}${__SUMI_LANGUAGE_MANIFEST__}`).then(async response => {
      if (!response.ok) throw new Error('Language catalogue unavailable')
      return await response.json() as LanguageAssets
    }).catch(error => { assets = undefined; throw error })
  }
  const catalogue = await assets
  const files = catalogue[group][pack]?.files
  if (!files) throw new Error('Language pack unavailable')
  const key = `${group}:${pack}`
  let preparation = prepared.get(key)
  if (!preparation) {
    preparation = Promise.all(files.map(async file => {
      const response = await fetch(`${import.meta.env.BASE_URL}${file}`)
      if (!response.ok) throw new Error('Language download failed')
      // Consume the body before importing; headers alone do not establish that
      // the complete file arrived. Workbox retains the same successful response.
      await response.arrayBuffer()
    })).then(() => undefined).catch(error => { prepared.delete(key); throw error })
    prepared.set(key, preparation)
  }
  await preparation
}

const pending = new Map<LanguageId, Promise<Extension>>()
export function loadLanguage(id: LanguageId) {
  let promise = pending.get(id)
  if (!promise) {
    promise = waitForWorker().then(() => prepareAssets('languagePacks', ['typescript', 'jsx', 'tsx'].includes(id) ? 'javascript' : id)).then(() => loaders[id]()).catch(error => { pending.delete(id); throw error })
    pending.set(id, promise)
  }
  return promise
}

export const MAX_HIGHLIGHT_BYTES = 5 * 1024 * 1024
export const SAMPLE_BYTES = 16 * 1024
const encoder = new TextEncoder()
export function utf8Bytes(text: string) { return encoder.encode(text).length }
export function detectionSample(text: string) {
  const bytes = encoder.encode(text.slice(0, SAMPLE_BYTES))
  return new TextDecoder().decode(bytes.subarray(0, SAMPLE_BYTES))
}

// Only distinctive structures count. Generic words, expressions and tab titles do not.
export function detectLanguage(source: string): LanguageId | null {
  const text = detectionSample(source).trim()
  if (!text) return null
  const first = text.split('\n', 1)[0]!
  if (/^#!.*\bpython(?:3(?:\.\d+)?)?\b/.test(first)) return 'python'
  if (/^#!.*\b(?:node|nodejs)\b/.test(first)) return 'javascript'
  const candidates = new Set<LanguageId>()
  if (/^<!doctype\s+html\b|^<html(?:\s|>)/i.test(text)) candidates.add('html')
  if (/^[\[{]/.test(text)) {
    try { const value: unknown = JSON.parse(text); if (value && typeof value === 'object') return 'json' } catch { /* Incomplete JSON is ambiguous. */ }
  }
  if (/^(?:async\s+)?def\s+\w+\s*\([^\n]*\)\s*(?:->[^\n:]+)?:\s*(?:#.*)?$|^class\s+\w+(?:\([^\n]*\))?\s*:\s*(?:#.*)?$/m.test(text)) candidates.add('python')
  const ts = /^(?:export\s+)?(?:interface\s+\w+\s*(?:extends[^\n{]+)?\{|type\s+\w+\s*=)|\b(?:const|let)\s+\w+\s*:\s*(?:string|number|boolean)\b/m.test(text)
  const js = /\b(?:const|let|var)\s+\w+\s*=|\b(?:async\s+)?function\s+\w+\s*\(/.test(text)
  if (ts) candidates.add('typescript')
  else if (js) candidates.add('javascript')
  const fence = /^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*\n\s*(?:`{3,}|~{3,})\s*$/m.test(text)
  const heading = /^#{1,6}\s+\S/m.test(text)
  const list = /^(?:[-*+]\s+\S|\d+\.\s+\S)/m.test(text)
  const link = /\[[^\]\n]+\]\([^\s)]+\)/.test(text)
  if (fence || Number(heading) + Number(list) + Number(link) >= 2) candidates.add('markdown')
  const cssBlocks = text.match(/(?:^|\n)\s*[.#:@\w][^{}\n]*\{[^{}]*\}/g) ?? []
  if (cssBlocks.some(block => (block.match(/[\w-]+\s*:\s*[^;{}]+;/g)?.length ?? 0) >= 2)) candidates.add('css')
  if (/\bSELECT\s+[\s\S]+?\bFROM\s+[\w."`]+/i.test(text) && /\b(?:WHERE|JOIN|GROUP\s+BY|ORDER\s+BY|LIMIT)\b/i.test(text)
    || /\bCREATE\s+TABLE\s+\w+\s*\(/i.test(text) && /\b(?:PRIMARY\s+KEY|VARCHAR|INTEGER|NOT\s+NULL)\b/i.test(text)) candidates.add('sql')
  // Markup and fenced documents contain other languages by design.
  if (candidates.has('html')) return 'html'
  if (fence) return 'markdown'
  return candidates.size === 1 ? [...candidates][0]! : null
}
