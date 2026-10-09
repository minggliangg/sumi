import type { LanguageId } from './languages.ts'
const byExtension: Record<string, LanguageId | 'plain'> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', jsx: 'jsx', tsx: 'tsx', py: 'python',
  json: 'json', html: 'html', htm: 'html', css: 'css', md: 'markdown', markdown: 'markdown', sql: 'sql', txt: 'plain',
}
const extensions: Record<LanguageId, string> = { javascript: 'js', typescript: 'ts', jsx: 'jsx', tsx: 'tsx', python: 'py', json: 'json', html: 'html', css: 'css', markdown: 'md', sql: 'sql' }
export function languageForFilename(name: string) { return byExtension[name.split('.').pop()!.toLowerCase()] }
export function exportFilename(title: string, filename?: string, language?: LanguageId | null) {
  const safe = (filename ?? title).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/[.\s]+$/, '').slice(0, 80) || 'untitled'
  if (filename && /\.[a-z0-9]+$/i.test(safe)) return safe
  return `${safe}.${language ? extensions[language] : 'txt'}`
}
export async function readImportedFile(file: File) {
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} exceeds the 20 MiB import limit.`)
  const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
  if (text.includes('\0')) throw new Error(`${file.name} is not a supported text file.`)
  return text
}
