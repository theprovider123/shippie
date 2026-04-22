/**
 * KV reconciliation against the DB.
 *
 * The deploy hot path (see ./index.ts) writes three KV keys per app —
 * `apps:{slug}:meta`, `apps:{slug}:csp`, `apps:{slug}:active` — in that
 * order. These are independent writes; a crash mid-sequence can leave
 * the worker's read-through cache disagreeing with the DB about which
 * version is live.
 *
 * DB is the source of truth. This reaper walks every app that has an
 * `activeDeployId` set, compares `apps:{slug}:active` against the
 * deploy row's `version`, and re-writes the KV pointer when it drifts.
 * Running it periodically bounds the inconsistency window, regardless
 * of whether any single deploy crashed partway through its KV writes.
 *
 * Meta and CSP reconciliation are intentionally out of scope here:
 * meta has a graceful worker fallback and CSP is rebuilt from the
 * trust pipeline on the next deploy. Both are recoverable without
 * replaying the trust pipeline; the active pointer is the one value
 * whose drift can make a deploy invisible.
 */
import { eq, isNotNull } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { DevKv, getDevKvDir } from '@shippie/dev-storage';
import type { KvStore } from '@shippie/dev-storage';
import { getDb } from '@/lib/db';

export interface ReconcileResult {
  checked: number;
  updated: string[];
  missing_version: string[];
  errors: Array<{ slug: string; reason: string }>;
}

export interface ReconcileOptions {
  /** Injected for tests; defaults to the module-global Drizzle client. */
  db?: Awaited<ReturnType<typeof getDb>>;
  /** Injected for tests; defaults to a `DevKv` over the repo's dev state dir. */
  kv?: KvStore;
}

export async function reconcileActivePointers(
  options: ReconcileOptions = {},
): Promise<ReconcileResult> {
  const db = options.db ?? (await getDb());
  const kv = options.kv ?? new DevKv(getDevKvDir());
  const result: ReconcileResult = {
    checked: 0,
    updated: [],
    missing_version: [],
    errors: [],
  };

  const rows = await db
    .select({
      slug: schema.apps.slug,
      version: schema.deploys.version,
    })
    .from(schema.apps)
    .leftJoin(schema.deploys, eq(schema.deploys.id, schema.apps.activeDeployId))
    .where(isNotNull(schema.apps.activeDeployId));

  for (const row of rows) {
    result.checked += 1;
    if (row.version == null) {
      result.missing_version.push(row.slug);
      continue;
    }
    const expected = String(row.version);
    try {
      const current = await kv.get(`apps:${row.slug}:active`);
      if (current !== expected) {
        await kv.put(`apps:${row.slug}:active`, expected);
        result.updated.push(row.slug);
      }
    } catch (err) {
      result.errors.push({ slug: row.slug, reason: (err as Error).message });
    }
  }

  return result;
}
