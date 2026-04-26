/**
 * reconcile-kv cron — runs every 5 minutes.
 *
 * Reads every app's `activeDeployId` from D1 and re-writes any
 * `apps:{slug}:active` (and `apps:{slug}:csp`) KV entry that disagrees.
 * Backstops the deploy hot-path's non-atomic three-key KV write sequence.
 *
 * Idempotent: a converged DB ↔ KV state is a no-op.
 *
 * Errors per-app are caught so one bad row never stops the sweep.
 */
import { eq, isNotNull } from 'drizzle-orm';
import { getDrizzleClient, schema } from '../db/client';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

export interface ReconcileKvEnv {
  DB: D1Database;
  CACHE: KVNamespace;
}

export interface ReconcileKvResult {
  checked: number;
  updated: string[];
  csp_updated: string[];
  missing_version: string[];
  errors: Array<{ slug: string; reason: string }>;
}

const PAGE_SIZE = 500;

export async function reconcileKv(env: ReconcileKvEnv): Promise<ReconcileKvResult> {
  const db = getDrizzleClient(env.DB);
  const result: ReconcileKvResult = {
    checked: 0,
    updated: [],
    csp_updated: [],
    missing_version: [],
    errors: [],
  };

  // Page through apps; D1 has time limits on scheduled events so cap loops.
  let offset = 0;
  let pages = 0;
  while (pages < 200) {
    const rows = await db
      .select({
        slug: schema.apps.slug,
        version: schema.deploys.version,
        cspHeader: schema.deploys.cspHeader,
      })
      .from(schema.apps)
      .leftJoin(schema.deploys, eq(schema.deploys.id, schema.apps.activeDeployId))
      .where(isNotNull(schema.apps.activeDeployId))
      .limit(PAGE_SIZE)
      .offset(offset);

    if (rows.length === 0) break;

    for (const row of rows) {
      result.checked += 1;
      if (row.version == null) {
        result.missing_version.push(row.slug);
        continue;
      }
      const expected = String(row.version);
      try {
        const current = await env.CACHE.get(`apps:${row.slug}:active`);
        if (current !== expected) {
          await env.CACHE.put(`apps:${row.slug}:active`, expected);
          result.updated.push(row.slug);
        }
        if (row.cspHeader != null) {
          const currentCsp = await env.CACHE.get(`apps:${row.slug}:csp`);
          if (currentCsp !== row.cspHeader) {
            await env.CACHE.put(`apps:${row.slug}:csp`, row.cspHeader);
            result.csp_updated.push(row.slug);
          }
        }
      } catch (err) {
        result.errors.push({ slug: row.slug, reason: (err as Error).message });
      }
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    pages += 1;
  }

  console.log(
    `[cron:reconcile-kv] checked=${result.checked} updated=${result.updated.length} csp_updated=${result.csp_updated.length} missing=${result.missing_version.length} errors=${result.errors.length}`,
  );
  return result;
}
