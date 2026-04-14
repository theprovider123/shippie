export * from './types.ts';
export { DevKv } from './dev-kv.ts';
export { DevR2 } from './dev-r2.ts';

/**
 * Canonical state-dir path for local dev. Both the worker dev server
 * and the platform Next.js process write/read THIS EXACT DIRECTORY.
 *
 * Resolution order:
 *   1. $SHIPPIE_DEV_STATE_DIR if set
 *   2. Walk up from the current file looking for turbo.json → <repo>/.shippie-dev-state
 *   3. Walk up from process.cwd() looking for turbo.json
 *   4. Fall back to process.cwd()/.shippie-dev-state (usually wrong — emits a warning)
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedStateDir: string | null = null;

export function getDevStateDir(): string {
  if (cachedStateDir) return cachedStateDir;

  const fromEnv = process.env.SHIPPIE_DEV_STATE_DIR;
  if (fromEnv) {
    cachedStateDir = resolve(fromEnv);
    return cachedStateDir;
  }

  // Walk up from this module looking for the repo root.
  // When published to npm, we fall back to cwd-based resolution.
  try {
    const moduleFile = fileURLToPath(import.meta.url);
    const moduleDir = dirname(moduleFile);
    const repoRoot = findRepoRoot(moduleDir);
    if (repoRoot) {
      cachedStateDir = join(repoRoot, '.shippie-dev-state');
      return cachedStateDir;
    }
  } catch {
    // import.meta.url may be unavailable in some runtimes — fall through
  }

  const cwdRoot = findRepoRoot(process.cwd());
  if (cwdRoot) {
    cachedStateDir = join(cwdRoot, '.shippie-dev-state');
    return cachedStateDir;
  }

  // Last-resort fallback. Warn because this usually means each process
  // will have its own state dir and writes won't be visible cross-process.
  cachedStateDir = join(process.cwd(), '.shippie-dev-state');
  if (typeof console !== 'undefined') {
    console.warn(
      '[@shippie/dev-storage] could not find repo root (looking for turbo.json). ' +
        'Using cwd-based state dir: ' +
        cachedStateDir,
    );
  }
  return cachedStateDir;
}

function findRepoRoot(start: string): string | null {
  let current = start;
  // Walk up at most 20 levels
  for (let i = 0; i < 20; i++) {
    if (existsSync(join(current, 'turbo.json'))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

export function getDevKvDir(): string {
  return join(getDevStateDir(), 'kv', 'app-config');
}

export function getDevR2AppsDir(): string {
  return join(getDevStateDir(), 'r2', 'shippie-apps');
}

export function getDevR2PublicDir(): string {
  return join(getDevStateDir(), 'r2', 'shippie-public');
}
