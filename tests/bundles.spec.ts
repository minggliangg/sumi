import { readFile, access } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

interface SizeReport {
  minifiedBytes: number
  gzipBytes: number
  files: string[]
}
interface BundleReport {
  initialJavaScript: SizeReport
  languagePacks: Record<string, SizeReport & { entryFile: string }>
  combinedLanguages: SizeReport
}

async function report(): Promise<BundleReport> {
  return JSON.parse(await readFile('dist/language-bundle-report.json', 'utf8'))
}

test('build reports seven language closures and precaches only the application shell', async () => {
  const bundles = await report()
  expect(Object.keys(bundles.languagePacks).sort()).toEqual(['css', 'html', 'javascript', 'json', 'markdown', 'python', 'sql'])
  expect(new Set(Object.values(bundles.languagePacks).map((pack) => pack.entryFile)).size).toBe(7)
  const worker = await readFile('dist/sw.js', 'utf8')
  const precache = worker.match(/precacheAndRoute\((\[.*?\]),/)?.[1]
  expect(precache).toBeTruthy()
  const manifestFile = precache?.match(/language-assets-[^"\s]+\.json/)?.[0]
  expect(manifestFile).toBeTruthy()
  const manifest = JSON.parse(await readFile(`dist/${manifestFile}`, 'utf8'))
  expect(manifest.languagePacks).toEqual(bundles.languagePacks)
  const combined = new Set<string>()
  for (const pack of Object.values(bundles.languagePacks)) {
    expect(pack.files).toContain(pack.entryFile)
    expect(pack.minifiedBytes).toBeGreaterThan(0)
    expect(pack.gzipBytes).toBeLessThan(pack.minifiedBytes)
    for (const file of pack.files) {
      await access(`dist/${file}`)
      expect(bundles.initialJavaScript.files).not.toContain(file)
      expect(precache).not.toContain(file)
      combined.add(file)
    }
  }
  expect([...combined].sort()).toEqual([...bundles.combinedLanguages.files].sort())
  for (const file of bundles.initialJavaScript.files) expect(precache).toContain(file)
  expect(bundles.initialJavaScript.files.some((file) => file.includes('workbox-window'))).toBe(true)
})

test('worker serves previous-release language cache entries while offline', async ({ page, context }) => {
  const bundles = await report()
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  const pack = bundles.languagePacks.python
  // Seed a retained previous-release cache, then remove current-release runtime
  // copies. The old cache must be searched by exact URL before network access.
  await page.evaluate(async ({ files }) => {
    const retained = await caches.open('sumi-languages-test-previous-release')
    for (const file of files) {
      const request = new URL(file, document.baseURI)
      const response = await fetch(request)
      const headers = new Headers(response.headers)
      // This synthetic response contains decoded bytes, and unlike a real
      // module request the seeding fetch has no Origin header. Remove transport
      // and request-specific headers before reusing it as a module response.
      for (const name of ['content-encoding', 'content-length', 'transfer-encoding', 'vary']) headers.delete(name)
      headers.set('x-sumi-retained-cache', 'previous-release')
      await retained.put(request, new Response(await response.arrayBuffer(), { status: 200, headers }))
    }
    for (const name of await caches.keys()) {
      if (name.startsWith('sumi-languages-') && name !== 'sumi-languages-test-previous-release') await caches.delete(name)
    }
  }, { files: pack.files })
  await context.setOffline(true)
  const marker = await page.evaluate(async (entry) => {
    const response = await fetch(new URL(entry, document.baseURI))
    return response.headers.get('x-sumi-retained-cache')
  }, pack.entryFile)
  expect(marker).toBe('previous-release')
  await page.getByRole('button', { name: 'Choose language', exact: true }).click()
  await page.getByRole('dialog', { name: 'Language', exact: true }).getByRole('button', { name: 'Python', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Choose language', exact: true })).toHaveAttribute('data-language-status', 'ready')
  await page.getByRole('textbox').fill('def greet():\n    return "hello"')
  await expect(page.locator('.cm-content .tok-keyword').first()).toBeVisible()
})

test('language chosen on the first visit is available after an offline reload', async ({ page, context }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Choose language', exact: true }).click()
  await page.getByRole('dialog', { name: 'Language', exact: true }).getByRole('button', { name: 'Python', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Choose language', exact: true })).toHaveAttribute('data-language-status', 'ready')
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('button', { name: 'Choose language', exact: true }).click()
  await page.getByRole('dialog', { name: 'Language', exact: true }).getByRole('button', { name: 'Python', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Choose language', exact: true })).toHaveAttribute('data-language-status', 'ready')
  await page.getByRole('textbox').fill('def greet():\n    return "hello"')
  await expect(page.locator('.cm-content .tok-keyword').first()).toBeVisible()
})
