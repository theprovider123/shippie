import { defineConfig } from 'tsup';

/**
 * Build @shippie/db to ESM so Next.js can load it as a
 * serverExternalPackage (plain Node require). This lets the PGlite
 * instance live in a single shared module scope across all route
 * bundles — otherwise each route would get its own bundled copy and
 * re-instantiate PGlite per request, which causes WASM runtime aborts.
 *
 * Consumers:
 *   - apps/web (Next.js) → requires the built dist/index.js
 *   - packages/db test runner (Bun) → reads src/*.ts directly
 *   - scripts/migrate.ts → also reads src/*.ts directly via Bun
 *
 * Drizzle, postgres-js, PGlite, and @shippie/shared are externalized
 * so they resolve from the consumer's node_modules (or workspace).
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'schema/index': 'src/schema/index.ts',
    client: 'src/client.ts',
    migrate: 'src/migrate.ts',
  },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'drizzle-orm',
    'postgres',
    '@electric-sql/pglite',
    '@shippie/shared',
  ],
  outDir: 'dist',
});
