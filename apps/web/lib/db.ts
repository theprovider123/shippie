/**
 * Singleton Drizzle client for the platform (shippie.app).
 *
 * Uses PGlite in dev (DATABASE_URL="pglite://..." or unset) and
 * postgres-js against Hetzner + PgBouncer in production.
 *
 * The handle is cached on `globalThis` so it survives Next.js dev-server
 * HMR reloads. Without this cache, every hot-reload would spin up a
 * fresh PGlite WASM instance — they'd accumulate and eventually abort
 * with a WASM runtime error.
 */
import { createDb, type ShippieDbHandle } from '@shippie/db';

declare global {
  // eslint-disable-next-line no-var
  var __shippieDbHandle: Promise<ShippieDbHandle> | undefined;
}

export function getDbHandle(): Promise<ShippieDbHandle> {
  if (!globalThis.__shippieDbHandle) {
    globalThis.__shippieDbHandle = createDb({ url: process.env.DATABASE_URL });
  }
  return globalThis.__shippieDbHandle;
}

export async function getDb() {
  return (await getDbHandle()).db;
}
