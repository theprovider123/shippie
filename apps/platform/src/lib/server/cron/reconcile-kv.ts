/**
 * reconcile-kv cron — runs every 5 minutes.
 *
 * Reads every app's `activeDeployId` from D1 and re-writes any
 * `apps:{slug}:active` (and `apps:{slug}:csp`) KV entry that disagrees.
 * Backstops the deploy hot-path's non-atomic three-key KV write sequence.
 *
 * Also reconciles `visibility_scope` / `organization_id` inside the
 * `apps:{slug}:meta` blob. The wrapper's access gate reads visibility
 * from KV only, so a lost patch (visibility toggle raced by a deploy's
 * full-blob rewrite, or a swallowed KV error) would otherwise serve a
 * public app as private — or vice versa — until the next deploy.
 *
 * Idempotent: a converged DB ↔ KV state is a no-op.
 *
 * Errors per-app are caught so one bad row never stops the sweep.
 */
import { and, eq, isNotNull } from 'drizzle-orm';
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
  meta_updated: string[];
  missing_version: string[];
  errors: Array<{ slug: string; reason: string }>;
}

export interface ReconcileRow {
  slug: string;
  version: number | null;
  cspHeader: string | null;
  visibilityScope: string;
  organizationId: string | null;
}

/** Page fetcher. Default reads via drizzle; tests inject a stub. */
export type FetchPage = (offset: number, limit: number) => Promise<ReconcileRow[]>;

const PAGE_SIZE = 500;

async function defaultFetchPage(env: ReconcileKvEnv, offset: number, limit: number): Promise<ReconcileRow[]> {
  const db = getDrizzleClient(env.DB);
  return db
    .select({
      slug: schema.apps.slug,
      version: schema.deploys.version,
      cspHeader: schema.deploys.cspHeader,
      visibilityScope: schema.apps.visibilityScope,
      organizationId: schema.apps.organizationId,
    })
    .from(schema.apps)
    .leftJoin(schema.deploys, eq(schema.deploys.id, schema.apps.activeDeployId))
    .where(and(isNotNull(schema.apps.activeDeployId), eq(schema.apps.isArchived, false)))
    .limit(limit)
    .offset(offset);
}

export async function reconcileKv(
  env: ReconcileKvEnv,
  fetchPage?: FetchPage,
): Promise<ReconcileKvResult> {
  const fetcher: FetchPage = fetchPage ?? ((off, lim) => defaultFetchPage(env, off, lim));
  const result: ReconcileKvResult = {
    checked: 0,
    updated: [],
    csp_updated: [],
    meta_updated: [],
    missing_version: [],
    errors: [],
  };

  // Page through apps; D1 has time limits on scheduled events so cap loops.
  let offset = 0;
  let pages = 0;
  while (pages < 200) {
    const rows = await fetcher(offset, PAGE_SIZE);

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
        // Meta blob: visibility/org must track D1 — the access gate reads
        // KV only. Patch-only (no blob ⇒ skip): a missing blob means the
        // app isn't serving, and the next deploy writes the full row.
        const rawMeta = await env.CACHE.get(`apps:${row.slug}:meta`);
        if (rawMeta) {
          let meta: Record<string, unknown> | null = null;
          try {
            meta = JSON.parse(rawMeta) as Record<string, unknown>;
          } catch {
            meta = null;
          }
          if (meta) {
            const wantOrg = row.organizationId ?? undefined;
            if (meta.visibility_scope !== row.visibilityScope || meta.organization_id !== wantOrg) {
              await env.CACHE.put(
                `apps:${row.slug}:meta`,
                JSON.stringify({ ...meta, visibility_scope: row.visibilityScope, organization_id: wantOrg }),
              );
              result.meta_updated.push(row.slug);
            }
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
    `[cron:reconcile-kv] checked=${result.checked} updated=${result.updated.length} csp_updated=${result.csp_updated.length} meta_updated=${result.meta_updated.length} missing=${result.missing_version.length} errors=${result.errors.length}`,
  );
  return result;
}
