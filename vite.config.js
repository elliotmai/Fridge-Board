import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      // Auto-update: a new deploy's service worker installs and takes over,
      // then the app reloads to the latest code with no "refresh?" prompt.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon.svg'],
      manifest: {
        name: 'Hive',
        short_name: 'Hive',
        description: 'Every app in one home screen: the farm, the kitchen, trips, school and more.',
        theme_color: '#f3f4f1',
        background_color: '#f3f4f1',
        display: 'standalone',
        orientation: 'any', // landscape on the fridge, portrait on phones
        start_url: '/',
        icons: [
          // SVG covers all sizes. Add pwa-192.png / pwa-512.png (+ a maskable
          // 512) to /public/icons for best Android install icons, then list
          // them here — see README "Icons".
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
  ],
});
