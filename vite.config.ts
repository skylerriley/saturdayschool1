import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Generates dist/sw.js (Workbox): precaches the app shell so the installed
    // PWA cold-opens offline, and runtime-caches Supabase reads / fonts /
    // weather so the last-seen data renders with no signal on the course.
    // Push notification handlers live in public/push-handlers.js and are
    // pulled into the generated SW via importScripts (same /sw.js URL the
    // Settings push opt-in flow has always registered).
    VitePWA({
      registerType: 'autoUpdate',
      // We register the SW ourselves via virtual:pwa-register (src/lib/swUpdate.ts)
      // so we can auto-reload open tabs off stale deploys and poll for new versions.
      injectRegister: null,
      manifest: false, // keep the existing hand-written public/manifest.json
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,gif,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        importScripts: ['push-handlers.js'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Supabase PostgREST reads: try network, fall back to last-seen data
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/v1/'),
            method: 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-data',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 300, maxAgeSeconds: 7 * 24 * 3600 },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'api.open-meteo.com',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'weather',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 40, maxAgeSeconds: 6 * 3600 },
            },
          },
          {
            // Supabase Storage images (hole photos, scorecards).
            // New uploads now carry `cache-control: max-age=31536000, immutable`
            // (set in the upload shim); the filename embeds Date.now() so a
            // replaced image gets a fresh URL. CacheFirst serves straight from
            // Cache Storage once stored (also covering the legacy no-cache
            // objects until the backfill runs). cacheableResponse guards against
            // storing an error/opaque response.
            // maxEntries sized for the whole media corpus: 18 holes x ~15
            // courses (~270) + green-view tracers + scorecards + event images.
            // 400 was under-provisioned -- LRU eviction there means a re-fetch
            // (billed cached egress) every time an evicted photo scrolls back,
            // so raise it well above the working set.
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/storage/v1/object/public/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-images',
              expiration: { maxEntries: 1200, maxAgeSeconds: 365 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true, // expose on your LAN so you can open it from your phone
  },
})
