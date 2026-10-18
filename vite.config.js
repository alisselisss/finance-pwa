import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Мои финансы',
        short_name: 'Финансы',
        description: 'Личный учёт расходов, свободных денег и накоплений',
        lang: 'ru',
        // Относительные пути: корректны и на GitHub Pages (/repo/), и на localhost
        start_url: './',
        scope: './',
        theme_color: '#0f9d76',
        background_color: '#f6f7f9',
        display: 'standalone',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
})
