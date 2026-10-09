import { defineConfig, type Plugin } from 'vite'
import { gzipSync } from 'node:zlib'
import solid from 'vite-plugin-solid'
import { VitePWA } from 'vite-plugin-pwa'

// Each worker keeps its own caches: approving an update must not delete assets
// that an already-open window may still reference.
const release = Date.now().toString(36)
const languageManifest = `language-assets-${release}.json`
const initialJavaScript = new Set<string>()

function languageBundleReport(): Plugin {
  return {
    name: 'sumi-language-bundle-report',
    generateBundle(_options, bundle) {
      const visit = (file: string, files: Set<string>) => {
        if (files.has(file)) return
        const chunk = bundle[file]
        if (!chunk || chunk.type !== 'chunk') return
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
          const chunk = bundle[file]
          if (chunk?.type !== 'chunk') continue
          minifiedBytes += Buffer.byteLength(chunk.code)
          gzipBytes += gzipSync(chunk.code).byteLength
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
      const report = { initialJavaScript: size(initialJavaScript), languagePacks, combinedLanguages: size(combined) }
      this.emitFile({ type: 'asset', fileName: 'language-bundle-report.json', source: JSON.stringify(report, null, 2) })
      this.emitFile({ type: 'asset', fileName: languageManifest, source: JSON.stringify({ languagePacks }) })
      console.info(`Language payload: ${report.combinedLanguages.minifiedBytes} bytes minified, ${report.combinedLanguages.gzipBytes} bytes gzip`)
    },
  }
}

export default defineConfig({
  define: { __SUMI_LANGUAGE_MANIFEST__: JSON.stringify(languageManifest) },
  plugins: [
    solid(),
    languageBundleReport(),
    VitePWA({
      // Activation and reload require user approval while text lives in memory.
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
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
            return sameOrigin && ((url.pathname.startsWith(scope + 'assets/') && url.pathname.endsWith('.js'))
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
        theme_color: '#fbfaf7',
        background_color: '#fbfaf7',
        display: 'standalone',
        // TODO: add 192/512 PNG + maskable icons for broader install support
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
    }),
  ],
})
