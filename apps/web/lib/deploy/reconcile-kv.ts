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
 * `activeDeployId` set, then for each one:
 *   - Compares `apps:{slug}:active` against the deploy row's `version`;
 *     re-writes on drift.
 *   - Compares `apps:{slug}:csp` against the deploy row's stored
 *     `cspHeader` (migration 0014); re-writes on drift. Rows without a
 *     stored CSP (pre-0014 deploys, or deploys that failed before the
 *     `success` update) are left alone — there's nothing authoritative
 *     to reconcile against.
 *
 * Meta is still not reconciled: we don't persist a canonical meta blob
 * separately, so reconstructing it requires replaying the trust
 * pipeline. The worker has a graceful fallback, and the next deploy
 * rewrites meta cleanly, so the drift window is acceptable.
 *
 * Running this periodically bounds the inconsistency window regardless
 * of whether any single deploy or rollback crashed partway through its
 * KV writes.
 */
import { eq, isNotNull } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { DevKv, getDevKvDir } from '@shippie/dev-storage';
import type { KvStore } from '@shippie/dev-storage';
import { getDb } from '@/lib/db';

export interface ReconcileResult {
  checked: number;
  /** slugs where `apps:{slug}:active` was rewritten. */
  updated: string[];
  /** slugs where `apps:{slug}:csp` was rewritten. */
  csp_updated: string[];
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
    csp_updated: [],
    missing_version: [],
    errors: [],
  };

  const rows = await db
    .select({
      slug: schema.apps.slug,
      version: schema.deploys.version,
      cspHeader: schema.deploys.cspHeader,
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

      // CSP: only reconcile when the target deploy actually has a stored
      // header. A null `cspHeader` means the deploy predates migration
      // 0014 or never reached the `success` update — either way we have
      // no authoritative value, so leave whatever KV already holds.
      if (row.cspHeader != null) {
        const currentCsp = await kv.get(`apps:${row.slug}:csp`);
        if (currentCsp !== row.cspHeader) {
          await kv.put(`apps:${row.slug}:csp`, row.cspHeader);
          result.csp_updated.push(row.slug);
        }
      }
    } catch (err) {
      result.errors.push({ slug: row.slug, reason: (err as Error).message });
    }
  }

  return result;
}
