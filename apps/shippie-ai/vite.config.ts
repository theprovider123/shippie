/**
 * Vite config for the Shippie AI app.
 *
 * Two entry points:
 *   - index.html       — user-facing PWA dashboard
 *   - inference.html   — hidden-iframe target loaded cross-origin from
 *                        other *.shippie.app apps. Listens for postMessage,
 *                        runs inference inside a dedicated Worker.
 *
 * The PWA plugin emits a service worker that caches model files in Cache
 * Storage so subsequent loads work offline (one cached model serves every
 * Shippie app on the device).
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      manifest: false, // we ship our own manifest.webmanifest in /public
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        inference: resolve(__dirname, 'inference.html'),
      },
    },
  },
  server: {
    port: 5180,
    headers: {
      // The inference frame is loaded cross-origin via <iframe>. The
      // origin-allowlist enforced inside the iframe is the security boundary;
      // CORP/COEP not required for postMessage.
      'X-Content-Type-Options': 'nosniff',
    },
  },
});
