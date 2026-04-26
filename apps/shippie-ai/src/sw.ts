/**
 * Service worker — caches the shell + model files in Cache Storage.
 *
 * vite-plugin-pwa runs this through workbox's injectManifest path; the
 * `__WB_MANIFEST` placeholder is filled at build time with the precache
 * list. Model files are cached on first fetch (network-first with long
 * fallback) so subsequent inferences are zero-network.
 *
 * The model cache name is stable across deploys so app updates don't evict
 * downloaded models — we only flush precache.
 */
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

precacheAndRoute(self.__WB_MANIFEST);

// Model files (transformers.js fetches *.onnx, *.json, tokenizer files)
// from the configured remoteHost. Cache them aggressively.
registerRoute(
  ({ url, request }: { url: URL; request: Request }) =>
    request.destination === '' &&
    (url.pathname.endsWith('.onnx') ||
      url.pathname.endsWith('.bin') ||
      url.pathname.endsWith('.json') ||
      url.pathname.includes('/tokenizer')),
  new CacheFirst({
    cacheName: 'shippie-ai-models',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24 * 90, // 90 days
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Note: `__WB_MANIFEST` is declared globally by `workbox-precaching` itself
// (see PrecacheController.d.ts). It's filled in by the build step at
// `precacheAndRoute(self.__WB_MANIFEST)` above. We don't redeclare it here
// to avoid a TS2717 conflict with the workbox-provided ambient declaration.

export {};
