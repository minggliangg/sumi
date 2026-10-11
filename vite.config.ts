import { defineConfig, type Plugin } from 'vite'
import { gzipSync } from 'node:zlib'
import solid from 'vite-plugin-solid'
import { VitePWA } from 'vite-plugin-pwa'

// Each worker keeps its own caches: approving an update must not delete assets
// that an already-open window may still reference.
const release = Date.now().toString(36)
const languageManifest = `language-assets-${release}.json`
const initialJavaScript = new Set<string>()
interface WorkerChunk {
  code: string
  imports: string[]
  modules: Record<string, unknown>
  isEntry: boolean
}
const workerChunks = new Map<string, WorkerChunk>()

function captureFormatterWorker(): Plugin {
  return {
    name: 'sumi-formatter-worker-graph',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk') workerChunks.set(chunk.fileName, chunk)
      }
    },
  }
}

function languageBundleReport(): Plugin {
  return {
    name: 'sumi-language-bundle-report',
    generateBundle(_options, bundle) {
      const chunkFor = (file: string) => {
        const output = bundle[file]
        return output?.type === 'chunk' ? output : workerChunks.get(file)
      }
      const visit = (file: string, files: Set<string>) => {
        if (files.has(file)) return
        const chunk = chunkFor(file)
        if (!chunk) return
        files.add(file)
        chunk.imports.forEach((dependency) => visit(dependency, files))
      }
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && (chunk.isEntry
          || Object.keys(chunk.modules).some((id) => id.includes('/workbox-window/')))) {
          visit(chunk.fileName, initialJavaScript)
        }
      }
      const size = (files: Set<string>) => {
        let minifiedBytes = 0
        let gzipBytes = 0
        for (const file of files) {
          const chunk = chunkFor(file)
          const asset = bundle[file]
          const bytes = chunk ? Buffer.from(chunk.code) : asset?.type === 'asset' ? Buffer.from(asset.source) : undefined
          if (!bytes) continue
          minifiedBytes += bytes.byteLength
          gzipBytes += gzipSync(bytes).byteLength
        }
        return { minifiedBytes, gzipBytes, files: [...files].sort() }
      }
      const languagePacks: Record<string, ReturnType<typeof size> & { entryFile: string }> = {}
      const combined = new Set<string>()
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue
        for (const moduleId of Object.keys(chunk.modules)) {
          const name = moduleId.match(/@codemirror\/lang-([^/]+)\/dist\/index\.js$/)?.[1]
          if (!name) continue
          const files = new Set<string>()
          visit(chunk.fileName, files)
          initialJavaScript.forEach((file) => files.delete(file))
          files.forEach((file) => combined.add(file))
          languagePacks[name] = { ...size(files), entryFile: chunk.fileName }
        }
      }
      const formatterPacks: Record<string, ReturnType<typeof size> & { entryFile: string }> = {}
      const combinedFormatters = new Set<string>()
      const formatterFiles = new Map(workerChunks)
      for (const chunk of Object.values(bundle)) if (chunk.type === 'chunk') formatterFiles.set(chunk.fileName, chunk)
      for (const [file, chunk] of formatterFiles) {
        const keys = new Set<string>()
        if (workerChunks.has(file) && chunk.isEntry) keys.add('worker')
        for (const moduleId of Object.keys(chunk.modules)) {
          if (/\/prettier\/standalone\.(m?js)$/.test(moduleId)) keys.add('prettier')
          const plugin = moduleId.match(/\/prettier\/plugins\/([^/.]+)\.(m?js)$/)?.[1]
          if (plugin) keys.add(plugin)
          if (/\/@astral-sh\/ruff-wasm(?:-web)?\//.test(moduleId)) keys.add('python')
          if (moduleId.includes('/sql-formatter/')) keys.add('sql')
        }
        for (const key of keys) {
          const files = new Set<string>()
          visit(file, files)
          initialJavaScript.forEach((initial) => files.delete(initial))
          if (key === 'python') for (const asset of Object.values(bundle)) if (asset.fileName.endsWith('.wasm')) files.add(asset.fileName)
          if (!files.size) continue
          files.forEach((asset) => combinedFormatters.add(asset))
          const previous = formatterPacks[key]
          if (previous) previous.files.forEach((asset) => files.add(asset))
          formatterPacks[key] = { ...size(files), entryFile: previous?.entryFile ?? file }
        }
      }
      const previewFiles = new Set<string>()
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && Object.keys(chunk.modules).some(id => /\/node_modules\/(markdown-it|dompurify)\//.test(id))) {
          visit(chunk.fileName, previewFiles)
        }
      }
      initialJavaScript.forEach(file => previewFiles.delete(file))
      const previewPacks = { markdown: size(previewFiles) }
      const report = { initialJavaScript: size(initialJavaScript), languagePacks, combinedLanguages: size(combined), formatterPacks, combinedFormatters: size(combinedFormatters), previewPacks }
      this.emitFile({ type: 'asset', fileName: 'language-bundle-report.json', source: JSON.stringify(report, null, 2) })
      this.emitFile({ type: 'asset', fileName: languageManifest, source: JSON.stringify({ languagePacks, formatterPacks, previewPacks }) })
      console.info(`Language payload: ${report.combinedLanguages.minifiedBytes} bytes minified, ${report.combinedLanguages.gzipBytes} bytes gzip`)
      console.info(`Formatter payload: ${report.combinedFormatters.minifiedBytes} bytes minified, ${report.combinedFormatters.gzipBytes} bytes gzip`)
    },
  }
}

// The Markdown preview's parser shares small helpers with the formatters and
// language packs. Without its own chunk, Rollup folds them into the parser's
// chunk, so every pack that needs them would also download the whole parser.
const SHARED_MARKDOWN_DEPENDENCIES = /\/node_modules\/(entities|mdurl|uc\.micro|linkify-it|punycode\.js)\//

export default defineConfig({
  define: { __SUMI_LANGUAGE_MANIFEST__: JSON.stringify(languageManifest) },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (SHARED_MARKDOWN_DEPENDENCIES.test(id)) return 'markdown-shared'
          if (/\/node_modules\/markdown-it\//.test(id)) return 'markdown-it'
          if (/\/node_modules\/dompurify\//.test(id)) return 'dompurify'
        },
      },
    },
  },
  worker: { format: 'es', plugins: () => [captureFormatterWorker()] },
  plugins: [
    solid(),
    languageBundleReport(),
    VitePWA({
      // Activation and reload require user approval while text lives in memory.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}', 'language-assets-*.json'],
        cacheId: `sumi-${release}`,
        cleanupOutdatedCaches: false,
        clientsClaim: true,
        manifestTransforms: [async (entries) => ({
          manifest: entries.filter(({ url }) => !url.endsWith('.js') || initialJavaScript.has(url)),
          warnings: [],
        })],
        runtimeCaching: [{
          // Serialized into the worker; resolve the base from its own scope.
          urlPattern: ({ url, sameOrigin }) => {
            const scope = new URL((globalThis as unknown as { registration: { scope: string } }).registration.scope).pathname
            return sameOrigin && ((url.pathname.startsWith(scope + 'assets/') && /\.(js|wasm)$/.test(url.pathname))
              || (url.pathname.startsWith(scope + 'language-assets-') && url.pathname.endsWith('.json')))
          },
          handler: 'CacheFirst',
          options: {
            cacheName: `sumi-languages-${release}`,
            cacheableResponse: { statuses: [200] },
            matchOptions: { ignoreVary: true },
            plugins: [{
              // Other windows can still request their previous release's
              // hashed chunks after one window approves the worker update.
              cachedResponseWillBeUsed: async ({ request, cachedResponse }) => {
                if (cachedResponse) return cachedResponse
                const storage = (globalThis as unknown as { caches: {
                  keys(): Promise<string[]>
                  open(name: string): Promise<{ match(input: typeof request, options: { ignoreVary: boolean; ignoreSearch: boolean }): Promise<typeof cachedResponse> }>
                } }).caches
                for (const name of await storage.keys()) {
                  if (!name.startsWith('sumi-')) continue
                  const response = await (await storage.open(name)).match(request, {
                    ignoreVary: true,
                    // Workbox stores revisioned metadata with a query suffix.
                    // Language code still uses exact hashed request URLs.
                    ignoreSearch: new URL(request.url).pathname.includes('/language-assets-'),
                  })
                  if (response) return response
                }
                return undefined
              },
            }],
          },
        }],
      },
      manifest: {
        name: 'sumi.',
        short_name: 'sumi.',
        description: 'A minimal writing and code editor.',
        theme_color: '#141414',
        background_color: '#141414',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
