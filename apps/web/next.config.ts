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
  transpilePackages: ['@shippie/shared', '@shippie/session-crypto', '@shippie/db'],
  experimental: {
    typedRoutes: true,
  },
  // Standard Next 16 defaults; we'll add headers/redirects/rewrites
  // and image/font optimization config in later weeks as needed.
};

export default config;
