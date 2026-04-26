/**
 * Drizzle client wrapper for the D1 binding.
 *
 * Cloudflare hands us a fresh D1Database per request via
 * `event.platform.env.DB`. Drizzle's d1 driver is a thin proxy over that
 * — it caches no connection state, so we construct it per request.
 *
 * Importing this module never touches the network: instantiation is
 * lazy. Tests can stub by passing a fake D1Database.
 */
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './schema';

export type ShippieDb = DrizzleD1Database<typeof schema>;

export function getDrizzleClient(d1: D1Database): ShippieDb {
  return drizzle(d1, { schema });
}

export { schema };
