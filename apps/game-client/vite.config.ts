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
      includeAssets: ['brand/favicon.png', 'brand/app-icon-*.png', 'brand/apple-touch-icon.png', 'brand/logo-jogar-tcg.png', 'brand/card-icon.png', 'brand/lor-card-back.webp', 'brand/lorcana-items/*.png'],
      // Padrão do Workbox + ícones dos textos das cartas (src/assets/card-icons), para funcionarem offline.
      workbox: { globPatterns: ['**/*.{js,css,html}', 'assets/*.png'] },
      manifest: {
        name: 'Jogar TCG',
        lang: 'pt-BR',
        short_name: 'JogarTCG',
        description: 'Monte, importe e jogue com seus decks.',
        theme_color: '#08090b',
        background_color: '#050607',
        display: 'standalone',
        orientation: 'any',
        // Mesmo emblema do favicon (images/icon.png), nos tamanhos que a instalação pede.
        // O maskable tem margem porque o Android recorta o ícone em círculo/gota.
        icons: [
          { src: 'brand/favicon.png', sizes: '32x32', type: 'image/png', purpose: 'any' },
          { src: 'brand/app-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'brand/app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'brand/app-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
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
