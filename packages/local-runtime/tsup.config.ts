import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts', browser: 'src/browser.ts' },
    format: ['esm'],
    target: 'es2022',
    platform: 'browser',
    dts: true,
    sourcemap: true,
    clean: true,
    external: [],
    noExternal: ['@shippie/local-db', '@shippie/local-files', '@shippie/local-runtime-contract', 'wa-sqlite'],
  },
  {
    entry: {
      'local/v1.latest': 'src/browser.ts',
      'local/worker.latest': 'src/db-worker.ts',
    },
    format: ['iife'],
    globalName: 'ShippieLocalRuntimeBundle',
    target: 'es2020',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    minify: true,
    external: [],
    noExternal: ['@shippie/local-db', '@shippie/local-files', '@shippie/local-runtime-contract', 'wa-sqlite'],
    outExtension: () => ({ js: '.js' }),
  },
]);
