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
    entry: {
      index: 'src/index.ts',
      'native/index': 'src/native/index.ts',
      'wrapper/index': 'src/wrapper/index.ts',
    },
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
    // Do not use `shippie` as the IIFE export namespace: tsup writes the
    // module export object to that global after the entry runs, which would
    // overwrite the real SDK object that src/index.ts attaches to window.
    globalName: '__shippieSdkExports',
    target: 'es2020',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    minify: true,
    external: [],
  },
  // Small runtime bundle kept for focused runtime experiments. Production
  // /__shippie/sdk.js uploads the full index.global IIFE so makers get the
  // real SDK surface plus the same self-booting install/proof/kind runtime.
  {
    entry: { 'wrapper-runtime.global': 'src/wrapper/runtime-bundle.ts' },
    format: ['iife'],
    target: 'es2020',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    minify: true,
    external: [],
  },
]);
