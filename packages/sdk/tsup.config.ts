import { defineConfig } from 'tsup';

/**
 * Build @shippie/sdk as:
 *   - ESM (dist/index.js)          — for import * as shippie from '@shippie/sdk'
 *   - IIFE (dist/index.global.js)  — served as /__shippie/sdk.js, attaches
 *                                    window.shippie
 *   - d.ts (dist/index.d.ts)       — TypeScript consumers
 *
 * The hosted CDN version served at cdn.shippie.app/sdk/v1.latest.js uses
 * the IIFE build. Makers importing via npm get the ESM build.
 *
 * Spec v6 §7.2.
 */
export default defineConfig([
  {
    entry: { index: 'src/index.ts', 'native/index': 'src/native/index.ts' },
    format: ['esm'],
    target: 'es2022',
    platform: 'browser',
    dts: true,
    sourcemap: true,
    clean: true,
    minify: false,
    external: [],
  },
  {
    entry: { 'index.global': 'src/index.ts' },
    format: ['iife'],
    globalName: 'shippie',
    target: 'es2020',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    minify: true,
    external: [],
    footer: {
      js: 'if (typeof window !== "undefined") { window.shippie = shippie; }',
    },
  },
]);
