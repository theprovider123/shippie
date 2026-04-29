#!/usr/bin/env node
/**
 * Upload the real @shippie/sdk browser IIFE to PLATFORM_ASSETS R2 at
 * sdk/v1.latest.js. Run as part of the platform deploy.
 *
 * The dispatcher in src/lib/server/wrapper/router/sdk.ts reads this object
 * and serves it at /__shippie/sdk.js on every maker subdomain. If the
 * object is missing, the dispatcher falls back to the dev stub for local
 * resilience; production deploys fail this step so they never publish with
 * the stub by accident.
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
  'packages/sdk/dist/index.global.global.js',
);

console.log('[upload-sdk-bundle] building @shippie/sdk runtime bundle...');
const build = spawnSync('bun', ['run', '--filter', '@shippie/sdk', 'build'], {
  stdio: 'inherit',
  cwd: repoRoot,
});
if (build.status !== 0) {
  console.error(`[upload-sdk-bundle] SDK build failed (exit ${build.status})`);
  process.exit(build.status ?? 1);
}

if (!existsSync(bundle)) {
  console.error(`[upload-sdk-bundle] missing bundle at ${bundle}`);
  console.error('  Expected "bun run --filter @shippie/sdk build" to create it.');
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
