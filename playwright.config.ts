import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://127.0.0.1:4173/sumi/', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm build:pages && pnpm preview --base=/sumi/ --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/sumi/',
    reuseExistingServer: false,
  },
})
