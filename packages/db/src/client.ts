/**
 * Drizzle client factory for Shippie.
 *
 * Two consumers:
 *   - apps/web (Vercel) → connects via Cloudflare Tunnel to PgBouncer on Hetzner
 *   - drizzle-kit (local) → connects directly via DATABASE_URL
 *
 * Connection pooling: PgBouncer in transaction mode, fronting the Postgres
 * instance on Hetzner. Vercel functions share the pool via the tunnel.
 *
 * Spec v6 §2.2.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.ts';

export type ShippieDb = ReturnType<typeof createDb>;

export interface CreateDbOptions {
  /** Connection string. Defaults to `process.env.DATABASE_URL`. */
  url?: string;
  /** Max pool size. Defaults to 10 — Vercel function-friendly. */
  max?: number;
  /** Idle timeout in seconds. Defaults to 20. */
  idleTimeout?: number;
  /** Enable Drizzle query logging. Defaults to false. */
  logger?: boolean;
}

export function createDb(opts: CreateDbOptions = {}) {
  const url = opts.url ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = postgres(url, {
    max: opts.max ?? 10,
    idle_timeout: opts.idleTimeout ?? 20,
    prepare: false, // PgBouncer transaction mode incompatible with prepared statements
  });

  return drizzle(client, { schema, logger: opts.logger ?? false });
}

export { schema };
