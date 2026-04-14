/**
 * The reserved __shippie/* route contract.
 *
 * Every app's Cloudflare Worker owns these paths. Maker files that collide
 * are HARD-BLOCKED at preflight — never silently rewritten. The only
 * exception is the existing pwa.conflict_policy for top-level
 * manifest.json / sw.js.
 *
 * See spec v6 §5 for the full route surface.
 */
export const RESERVED_PATH_PREFIX = '__shippie/' as const;

/**
 * Paths a maker bundle must NEVER produce. Preflight blocks any deploy
 * whose build output contains a file under this prefix.
 *
 * Top-level manifest.json and sw.js are NOT in this list — they're handled
 * by pwa.conflict_policy because makers legitimately ship them.
 */
export const isReservedPath = (path: string): boolean => {
  // Normalize leading slash
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  return normalized.startsWith(RESERVED_PATH_PREFIX);
};

/**
 * The top-level files handled by pwa.conflict_policy instead of being
 * hard-blocked. Maker may ship these and choose how Shippie reconciles.
 */
export const CONFLICT_POLICY_FILES = ['manifest.json', 'sw.js'] as const;
export type ConflictPolicyFile = (typeof CONFLICT_POLICY_FILES)[number];

export const CONFLICT_POLICIES = ['shippie', 'merge', 'own'] as const;
export type ConflictPolicy = (typeof CONFLICT_POLICIES)[number];

/**
 * Reserved route definitions for documentation + validation.
 * Grouped by subsystem.
 */
export const RESERVED_ROUTES = {
  core: [
    '__shippie/sdk.js',
    '__shippie/manifest',
    '__shippie/sw.js',
    '__shippie/icons/{size}.png',
    '__shippie/meta',
    '__shippie/health',
  ],
  auth: [
    '__shippie/auth/login',
    '__shippie/auth/callback',
    '__shippie/auth/logout',
    '__shippie/auth/revoke',
    '__shippie/session',
  ],
  storage: [
    '__shippie/storage/:collection',
    '__shippie/storage/:collection/:key',
    '__shippie/storage/public/:collection',
    '__shippie/storage/public/:collection/:key',
  ],
  files: ['__shippie/files', '__shippie/files/:key'],
  feedback: ['__shippie/feedback', '__shippie/feedback/:id/vote'],
  analytics: ['__shippie/analytics'],
  install: ['__shippie/install', '__shippie/install/phone', '__shippie/install/store'],
  functions: [
    '__shippie/fn/*',
    '__shippie/fn/_health',
    '__shippie/fn/_logs',
    '__shippie/fn/_account_delete',
  ],
} as const;
