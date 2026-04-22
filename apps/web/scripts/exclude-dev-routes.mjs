#!/usr/bin/env node
/**
 * Strip dev-only route files before `next build`.
 *
 * Some routes under `app/` exist to speed up local iteration (e.g.
 * /api/auth/dev-signin, which mints an admin session without the
 * magic-link dance). Those routes guard themselves with NODE_ENV at
 * runtime, but shipping them at all means a single env misconfiguration
 * is enough to re-enable them. The cleaner defense is physical: delete
 * the files from the build tree so they cannot be reached in the
 * deployed bundle regardless of any runtime flag.
 *
 * Gate: runs when `VERCEL=1` (any Vercel deployment, incl. previews —
 * preview URLs are public) or when opted in explicitly with
 * `SHIPPIE_STRIP_DEV_ROUTES=1` (self-hosters who want the same posture).
 * Otherwise it is a no-op, so local `bun run dev` / `bun run build` and
 * the docker-compose self-host flow keep the dev routes available.
 */
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DEV_ROUTES = ['app/api/auth/dev-signin'];

const onVercel = process.env.VERCEL === '1';
const explicit = process.env.SHIPPIE_STRIP_DEV_ROUTES === '1';

if (!onVercel && !explicit) {
  console.log(
    '[strip-dev-routes] skipping (set VERCEL=1 or SHIPPIE_STRIP_DEV_ROUTES=1 to enable)',
  );
  process.exit(0);
}

let removed = 0;
for (const rel of DEV_ROUTES) {
  const abs = resolve(webRoot, rel);
  if (existsSync(abs)) {
    rmSync(abs, { recursive: true, force: true });
    console.log(`[strip-dev-routes] removed ${rel}`);
    removed += 1;
  } else {
    console.log(`[strip-dev-routes] ${rel} already absent`);
  }
}

console.log(`[strip-dev-routes] done (${removed} path(s) removed)`);
