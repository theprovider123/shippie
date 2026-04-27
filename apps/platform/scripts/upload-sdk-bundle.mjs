#!/usr/bin/env node
/**
 * Upload the @shippie/sdk wrapper-runtime bundle to PLATFORM_ASSETS R2
 * at sdk/v1.latest.js. Run as part of the platform deploy.
 *
 * The dispatcher in src/lib/server/wrapper/router/sdk.ts reads this object
 * and serves it at /__shippie/sdk.js on every maker subdomain. If the
 * object is missing, the dispatcher falls back to the dev stub — so this
 * step is non-fatal but should always succeed in production.
 *
 * Phase 1A — switch to versioned uploads (sdk/v1.0.3.js + latest pointer)
 * once we have release discipline (Decision 1 in the master plan).
 */
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const repoRoot = resolve(root, '../..');

const bundle = resolve(
  repoRoot,
  'packages/sdk/dist/wrapper-runtime.global.global.js',
);

if (!existsSync(bundle)) {
  console.error(`[upload-sdk-bundle] missing bundle at ${bundle}`);
  console.error('  Run "bun --filter @shippie/sdk build" first.');
  process.exit(1);
}

const size = statSync(bundle).size;
console.log(`[upload-sdk-bundle] uploading ${bundle} (${size} bytes)`);

const args = [
  'wrangler',
  'r2',
  'object',
  'put',
  'shippie-assets/sdk/v1.latest.js',
  '--file',
  bundle,
  '--content-type',
  'application/javascript; charset=utf-8',
  '--remote',
];

const r = spawnSync('npx', args, { stdio: 'inherit', cwd: root });
if (r.status !== 0) {
  console.error(`[upload-sdk-bundle] wrangler r2 object put failed (exit ${r.status})`);
  process.exit(r.status ?? 1);
}

console.log('[upload-sdk-bundle] uploaded sdk/v1.latest.js to shippie-assets');
