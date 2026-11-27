import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  // Older tablet and phone browsers (an older Fire's Silk, an old Samsung) lack
  // `inset`; esbuild writes it out as top/right/bottom/left for them.
  build: { cssTarget: ['chrome61', 'safari12'] },
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
      includeAssets: ['favicon.svg', 'icons/icon.svg', 'icons/apple-touch-icon.png', 'icons/apple-touch-icon-dark.png'],
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
          // Honeycomb. icon.svg and favicon.svg switch to white-on-black in dark mode
          // (a media query inside the SVG); installed icons have no dark slot, so the
          // PNGs are the light version. Maskable has a full-bleed
          // background with the comb inside the safe zone so Android can crop it.
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // Apps served at Hive's own address (/apps/<id>/, netlify.toml) bring
        // their own pages and service worker; Hive's must not answer for them.
        navigateFallbackDenylist: [/^\/apps\//, /^\/api\//],
      },
      devOptions: { enabled: false },
    }),
  ],
});
