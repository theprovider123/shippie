/**
 * Drizzle client factory for Shippie.
 *
 * Two backends, one DATABASE_URL:
 *
 *   postgres://...          → postgres-js driver (Hetzner production,
 *                              docker postgres, Neon, Supabase, etc.)
 *   pglite://./data/db      → PGlite (in-process Postgres 16 via WASM,
 *                              zero-install local development)
 *   pglite://memory         → PGlite in memory (tests, ephemeral dev)
 *   (unset)                 → PGlite in memory (test defaults)
 *
 * Both drivers load the same migration files and execute the same SQL.
 * The factory normalizes the returned Drizzle instance so callers use
 * one type regardless of driver.
 *
 * Extensions loaded in PGlite: pgcrypto, pg_trgm — required by
 * migration 0001_init.sql. Postgres production has these as normal
 * `create extension` statements.
 *
 * Spec v6 §2.2 (platform hosting).
 */
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import postgres from 'postgres';
import * as schema from './schema/index.ts';

/**
 * A unified Drizzle instance exposing the schema barrel. Both drivers
 * produce compatible query APIs; we erase the underlying differences at
 * the type level so consumer code doesn't branch on driver.
 */
export type ShippieDb = ReturnType<typeof drizzlePg<typeof schema>>;

export interface CreateDbOptions {
  /** Connection URL. Defaults to process.env.DATABASE_URL. */
  url?: string;
  /** Max pool size (postgres-js only). Defaults to 10. */
  max?: number;
  /** Idle timeout in seconds (postgres-js only). Defaults to 20. */
  idleTimeout?: number;
  /** Enable Drizzle query logging. */
  logger?: boolean;
}

export interface ShippieDbHandle {
  db: ShippieDb;
  /** Close the underlying connection(s). Safe to call repeatedly. */
  close: () => Promise<void>;
  /** Backend kind for debugging and driver-specific branches in tests. */
  kind: 'pglite' | 'postgres';
  /**
   * Raw query escape hatch — executes a raw SQL string that Drizzle
   * can't express. Used only by the migration runner.
   */
  exec: (sql: string) => Promise<void>;
}

const PGLITE_PREFIX = 'pglite://';

/**
 * Build a ShippieDbHandle from DATABASE_URL.
 * Falls back to in-memory PGlite when unset.
 */
export async function createDb(opts: CreateDbOptions = {}): Promise<ShippieDbHandle> {
  const url = opts.url ?? process.env.DATABASE_URL ?? 'pglite://memory';

  if (url.startsWith(PGLITE_PREFIX)) {
    return createPgliteHandle(url.slice(PGLITE_PREFIX.length), opts);
  }

  return createPostgresHandle(url, opts);
}

async function createPgliteHandle(target: string, opts: CreateDbOptions): Promise<ShippieDbHandle> {
  const pglite = await PGlite.create({
    dataDir: target === 'memory' ? undefined : target,
    extensions: { pg_trgm, pgcrypto },
  });

  const db = drizzlePglite(pglite, { schema, logger: opts.logger ?? false }) as unknown as ShippieDb;

  return {
    db,
    kind: 'pglite',
    exec: async (sql) => {
      await pglite.exec(sql);
    },
    close: async () => {
      await pglite.close();
    },
  };
}

async function createPostgresHandle(url: string, opts: CreateDbOptions): Promise<ShippieDbHandle> {
  const client = postgres(url, {
    max: opts.max ?? 10,
    idle_timeout: opts.idleTimeout ?? 20,
    // PgBouncer transaction-mode compatibility
    prepare: false,
  });

  const db = drizzlePg(client, { schema, logger: opts.logger ?? false });

  return {
    db,
    kind: 'postgres',
    exec: async (sql) => {
      await client.unsafe(sql);
    },
    close: async () => {
      await client.end({ timeout: 5 });
    },
  };
}

export { schema };
