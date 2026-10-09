import { diffChars } from 'diff'
import type { LanguageId } from './languages.ts'

export interface FormatChange { from: number; to: number; insert: string }
interface Request { language: LanguageId; source: string }
const worker = globalThis as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null
  postMessage(message: { changes?: FormatChange[]; error?: string }): void
}

async function format({ language, source }: Request): Promise<string> {
  if (language === 'python') {
    const ruff = await import('@astral-sh/ruff-wasm-web')
    await ruff.default()
    const workspace = new ruff.Workspace({ 'line-length': 88, 'indent-width': 4, format: { 'indent-style': 'space', 'quote-style': 'double' } }, ruff.PositionEncoding.Utf16)
    try { return workspace.format(source) } finally { workspace.free() }
  }
  if (language === 'sql') {
    const sql = await import('sql-formatter')
    return sql.format(source, { language: 'sql', tabWidth: 2, keywordCase: 'upper' })
  }
  const prettier = await import('prettier/standalone')
  let parser: string
  const plugins = []
  if (['javascript', 'jsx', 'json'].includes(language)) {
    parser = language === 'json' ? 'json' : 'babel'
    plugins.push(await import('prettier/plugins/babel'), await import('prettier/plugins/estree'))
  } else if (language === 'typescript' || language === 'tsx') {
    parser = 'typescript'
    plugins.push(await import('prettier/plugins/typescript'), await import('prettier/plugins/estree'))
  } else if (language === 'html') {
    parser = 'html'; plugins.push(await import('prettier/plugins/html'))
  } else if (language === 'css') {
    parser = 'css'; plugins.push(await import('prettier/plugins/postcss'))
  } else {
    parser = 'markdown'; plugins.push(await import('prettier/plugins/markdown'))
  }
  return prettier.format(source, { parser, plugins, tabWidth: 2, printWidth: 80, semi: true, singleQuote: false, endOfLine: 'lf', embeddedLanguageFormatting: 'off' })
}

function changesFor(source: string, formatted: string): FormatChange[] {
  if (source === formatted) return []
  // Diff in the worker too: slow formatting or mapping never blocks typing.
  const parts = diffChars(source, formatted, { timeout: 200 })
  if (!parts) {
    let from = 0
    while (from < source.length && from < formatted.length && source[from] === formatted[from]) from++
    let suffix = 0
    while (suffix < source.length - from && suffix < formatted.length - from && source[source.length - 1 - suffix] === formatted[formatted.length - 1 - suffix]) suffix++
    return [{ from, to: source.length - suffix, insert: formatted.slice(from, formatted.length - suffix) }]
  }
  const changes: FormatChange[] = []
  let position = 0
  let current: FormatChange | undefined
  for (const part of parts) {
    if (!part.added && !part.removed) {
      if (current) { changes.push(current); current = undefined }
      position += part.value.length
    } else {
      current ??= { from: position, to: position, insert: '' }
      if (part.removed) { position += part.value.length; current.to = position }
      if (part.added) current.insert += part.value
    }
  }
  if (current) changes.push(current)
  return changes
}

worker.onmessage = async ({ data }) => {
  try {
    const formatted = await format(data)
    worker.postMessage({ changes: changesFor(data.source, formatted) })
  } catch (error) {
    worker.postMessage({ error: error instanceof Error ? error.message : String(error) })
  }
}
