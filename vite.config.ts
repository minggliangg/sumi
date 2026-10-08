import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    solid(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },
      manifest: {
        name: '墨 sumi',
        short_name: 'sumi',
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
