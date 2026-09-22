import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  build: {
    // Publicação estável consumida pelo Apache/BrowserSync e pelos apps nativos.
    outDir: '../../client',
    emptyOutDir: true
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'brand/favicon.png', 'brand/logo-jogar-tcg.png', 'brand/card-icon.png', 'brand/lor-card-back.webp', 'brand/lorcana-items/*.png'],
      // Padrão do Workbox + ícones dos textos das cartas (src/assets/card-icons), para funcionarem offline.
      workbox: { globPatterns: ['**/*.{js,css,html}', 'assets/*.png'] },
      manifest: {
        name: 'Jogar TCG',
        short_name: 'JogarTCG',
        description: 'Monte, importe e jogue com seus decks.',
        theme_color: '#08090b',
        background_color: '#050607',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: 'brand/favicon.png',
            sizes: '32x32',
            type: 'image/png',
            purpose: 'any'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@jogartcg/game-core': fileURLToPath(new URL('../../packages/game-core/src/index.ts', import.meta.url))
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost',
        changeOrigin: true,
        rewrite: (path) => `/jogartcg${path}`
      }
    }
  }
});
