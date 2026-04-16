import type { NextConfig } from 'next';

/**
 * Next.js 16 config for the Shippie control plane.
 *
 * - App Router only (no /pages)
 * - Workspace packages transpiled at build time
 * - Strict type/lint checking deferred until later weeks (set true at launch)
 *
 * Spec v6 §2.1, §19.
 */
const config: NextConfig = {
  reactStrictMode: true,
  // @shippie/db is intentionally NOT in transpilePackages — it's external
  // (see serverExternalPackages below) so the PGlite instance lives in a
  // shared Node module scope across routes, not per-bundle.
  transpilePackages: ['@shippie/shared', '@shippie/session-crypto'],
  typedRoutes: true,

  /**
   * Packages that must NOT go through Turbopack's module graph:
   *
   * - `@electric-sql/pglite` ships Postgres contrib extensions as .tar.gz
   *   binaries loaded at runtime from disk. Turbopack would rewrite them
   *   to hashed /_next/static/media/* URLs, breaking the extension loader.
   *
   * - `postgres` has native deps that shouldn't be bundled.
   *
   * - `@shippie/db` hosts the PGlite client. It must be loaded as a plain
   *   Node require so the PGlite instance cached on `globalThis` is shared
   *   across all route modules — otherwise each route bundle gets its own
   *   copy and tries to spin up its own PGlite, which causes the WASM
   *   runtime to abort from accumulated instances.
   *
   * - `@auth/drizzle-adapter` needs to see the same Drizzle schema module
   *   identity as @shippie/db to work correctly.
   */
  serverExternalPackages: [
    '@electric-sql/pglite',
    'postgres',
    '@shippie/db',
    '@shippie/dev-storage',
    '@shippie/pwa-injector',
    '@auth/drizzle-adapter',
    'adm-zip',
    'jose',
    'esbuild',
    '@resvg/resvg-js',
    'satori',
    'qrcode',
    'playwright',
    'playwright-core',
    'htmlparser2',
    'domhandler',
    'domutils',
    'dom-serializer',
  ],

  // Standard Next 16 defaults; we'll add headers/redirects/rewrites
  // and image/font optimization config in later weeks as needed.
};

export default config;
