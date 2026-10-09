import type DOMPurify from 'dompurify'
import { prepareAssets, waitForWorker } from '../editor/languages.ts'

// Loaded on first preview only, so the renderer stays out of the startup bundle.
type Pipeline = { md: ReturnType<typeof import('markdown-it').default>; purify: typeof DOMPurify }
let pipeline: Promise<Pipeline> | undefined

// Remote images would fetch from third-party hosts as soon as a document is
// previewed. Keep the alt text and show a placeholder instead.
const REMOTE = /^(?:https?:)?\/\//i

async function load(): Promise<Pipeline> {
  await waitForWorker()
  await prepareAssets('previewPacks', 'markdown')
  const [{ default: markdownIt }, { default: purify }] = await Promise.all([import('markdown-it'), import('dompurify')])
  // html: false escapes raw HTML in the source; the sanitizer below is a second layer.
  const md = markdownIt({ html: false, linkify: false, typographer: false })
  const defaultLink = md.renderer.rules.link_open ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options))
  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    tokens[index].attrSet('target', '_blank')
    tokens[index].attrSet('rel', 'noopener noreferrer')
    return defaultLink(tokens, index, options, env, self)
  }
  purify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName !== 'IMG') return
    const src = node.getAttribute('src') ?? ''
    if (!REMOTE.test(src)) return
    node.removeAttribute('src')
    node.removeAttribute('srcset')
    node.setAttribute('data-blocked-src', src)
    node.setAttribute('class', 'blocked-image')
    node.setAttribute('title', 'Remote image blocked in preview')
  })
  return { md, purify }
}

export function renderMarkdown(source: string): Promise<string> {
  pipeline ??= load().catch(error => {
    pipeline = undefined
    throw error
  })
  return pipeline.then(({ md, purify }) => purify.sanitize(md.render(source)))
}
