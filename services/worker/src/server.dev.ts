/**
 * Local dev server for the Shippie Worker.
 *
 * Runs the same Hono app as the Cloudflare Workers entry point, but
 * backed by filesystem adapters for KV and R2. Binds to port 4200 and
 * accepts any Host header shaped like `{slug}.localhost:4200` or
 * `{slug}.shippie.app` (useful for `curl -H Host:` testing).
 *
 * Browsers route `*.localhost` to 127.0.0.1 automatically — no hosts
 * file edit needed. Open `http://recipes.localhost:4200/__shippie/health`
 * directly in a browser or via curl.
 *
 * Spec v6 §2.1.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from './app.ts';
import type { WorkerEnv } from './env.ts';
import {
  DevKv,
  DevR2,
  getDevKvDir,
  getDevR2AppsDir,
  getDevR2PublicDir,
  getDevStateDir,
} from '@shippie/dev-storage';

const DEFAULT_PORT = Number(process.env.SHIPPIE_WORKER_PORT ?? 4200);

/**
 * Pull WORKER_PLATFORM_SECRET from apps/web/.env.local so the worker
 * and the platform agree on the HMAC key without manual environment
 * wiring. Falls back to an explicit env var if set, then to a
 * deterministic dev default so tests still run.
 */
function loadSharedSecret(): string {
  if (process.env.WORKER_PLATFORM_SECRET) return process.env.WORKER_PLATFORM_SECRET;

  // getDevStateDir() resolves to <repo>/.shippie-dev-state, so going up
  // one level gets us the repo root.
  const repoRoot = join(getDevStateDir(), '..');
  const envPath = join(repoRoot, 'apps', 'web', '.env.local');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    const match = content.match(/^WORKER_PLATFORM_SECRET\s*=\s*"?([^"\r\n]+)"?/m);
    if (match && match[1]) return match[1];
  }

  return 'dev-worker-platform-secret-change-me';
}

const env: WorkerEnv = {
  SHIPPIE_ENV: 'development',
  PLATFORM_API_URL: process.env.PLATFORM_API_URL ?? 'http://localhost:4100',
  WORKER_PLATFORM_SECRET: loadSharedSecret(),
  APP_CONFIG: new DevKv(getDevKvDir()),
  SHIPPIE_APPS: new DevR2(getDevR2AppsDir()),
  SHIPPIE_PUBLIC: new DevR2(getDevR2PublicDir()),
};

const app = createApp();

// Minimal ExecutionContext shim for Node/Bun. Hono only uses this in
// advanced scenarios (waitUntil for background work); not required for
// the current route set.
const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
};

const server = Bun.serve({
  port: DEFAULT_PORT,
  hostname: '0.0.0.0',
  fetch: (request) => app.fetch(request, env, ctx as never),
});

console.log(`[shippie:worker] dev server listening on`);
console.log(`  http://localhost:${server.port}`);
console.log(`  http://<anything>.localhost:${server.port}`);
console.log(`  state: ${getDevStateDir()}`);
console.log(`  hmac:  ${env.WORKER_PLATFORM_SECRET.slice(0, 16)}... (${env.WORKER_PLATFORM_SECRET.length} chars)`);
console.log();
console.log(`try:`);
console.log(`  curl http://recipes.localhost:${server.port}/__shippie/health`);
console.log(`  curl http://recipes.localhost:${server.port}/__shippie/meta`);
console.log(`  curl http://recipes.localhost:${server.port}/__shippie/sdk.js`);
