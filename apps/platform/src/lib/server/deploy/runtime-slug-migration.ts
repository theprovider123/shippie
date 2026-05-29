/**
 * Idempotent, resumable runtime-slug migration.
 *
 * Renaming a maker app moves its runtime state across KV (apps:{slug}:*),
 * R2 (apps/{slug}/...) and custom-domain pointers. The old implementation
 * copied each KV key and deleted the source inline, so a mid-flight failure
 * left split-brain: some keys under the new slug, some still under the old,
 * with sources already deleted.
 *
 * This runs as a small state machine — copy → verify → (only then) delete —
 * persisting progress to a KV state key so a retry resumes instead of
 * restarting. Invariants:
 *   - R2 objects are COPIED, never deleted: the old prefix stays readable
 *     through the alias period (see slug-aliases.ts).
 *   - Old KV keys are deleted ONLY after the new slug is verified to carry
 *     every key the old slug had. A crash before that point is safe to retry.
 */
import type { KVNamespace, R2Bucket } from '@cloudflare/workers-types';
import { eq } from 'drizzle-orm';
import type { ShippieDb } from '../db/client';
import { customDomains } from '../db/schema';

/** Per-slug KV runtime keys (the `apps:{slug}:{suffix}` shape). */
export const RUNTIME_KV_SUFFIXES = [
  'active',
  'csp',
  'wrap',
  'profile',
  'kind-profile',
  'shippie-json',
  'building',
  'meta',
] as const;

export type SlugMigrationStage =
  | 'pending'
  | 'r2_copied'
  | 'kv_copied'
  | 'verified'
  | 'complete'
  | 'failed';

export interface SlugMigrationState {
  appId: string;
  from: string;
  to: string;
  name: string;
  stage: SlugMigrationStage;
  error?: string;
  updatedAt: string;
}

const STAGE_ORDER: Record<SlugMigrationStage, number> = {
  pending: 0,
  r2_copied: 1,
  kv_copied: 2,
  verified: 3,
  complete: 4,
  failed: -1,
};

function stateKey(appId: string): string {
  return `apps:migrate:${appId}`;
}

function nowIso(): string {
  // App-runtime code (not a workflow script) — Date is available here.
  return new Date().toISOString();
}

async function readState(kv: KVNamespace, appId: string): Promise<SlugMigrationState | null> {
  const raw = await kv.get(stateKey(appId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SlugMigrationState;
  } catch {
    return null;
  }
}

async function writeState(kv: KVNamespace, state: SlugMigrationState): Promise<SlugMigrationState> {
  const next = { ...state, updatedAt: nowIso() };
  await kv.put(stateKey(state.appId), JSON.stringify(next));
  return next;
}

/** R2: copy every object under `from/` to `to/`. Idempotent; never deletes. */
async function copyR2Prefix(r2: R2Bucket, fromPrefix: string, toPrefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const listed = await r2.list({ prefix: fromPrefix, cursor });
    for (const item of listed.objects) {
      const source = await r2.get(item.key);
      if (!source) continue;
      const destination = toPrefix + item.key.slice(fromPrefix.length);
      await r2.put(destination, source.body, {
        httpMetadata: source.httpMetadata,
        customMetadata: source.customMetadata,
      });
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

/** KV: copy each runtime key from old → new slug. Copy-only (no delete). */
async function copyKvKeys(
  kv: KVNamespace,
  from: string,
  to: string,
  name: string,
): Promise<void> {
  for (const suffix of RUNTIME_KV_SUFFIXES) {
    if (suffix === 'meta') continue; // handled below (slug/name rewrite)
    const value = await kv.get(`apps:${from}:${suffix}`);
    if (value == null) continue;
    await kv.put(`apps:${to}:${suffix}`, value);
  }
  const meta = await kv.get(`apps:${from}:meta`);
  if (meta != null) {
    try {
      await kv.put(
        `apps:${to}:meta`,
        JSON.stringify({ ...(JSON.parse(meta) as Record<string, unknown>), slug: to, name }),
      );
    } catch {
      await kv.put(`apps:${to}:meta`, meta);
    }
  }
}

/** Verify the new slug carries every key the old slug still has. */
async function verifyCopied(kv: KVNamespace, from: string, to: string): Promise<boolean> {
  for (const suffix of RUNTIME_KV_SUFFIXES) {
    const had = await kv.get(`apps:${from}:${suffix}`);
    if (had == null) continue;
    const got = await kv.get(`apps:${to}:${suffix}`);
    if (got == null) return false;
  }
  return true;
}

/** Delete the old slug's KV keys. Only called after verifyCopied passes. */
async function deleteOldKvKeys(kv: KVNamespace, from: string): Promise<void> {
  for (const suffix of RUNTIME_KV_SUFFIXES) {
    await kv.delete(`apps:${from}:${suffix}`);
  }
}

/** Repoint verified custom-domain KV pointers at the new slug. Idempotent. */
async function repointCustomDomains(
  kv: KVNamespace,
  db: ShippieDb,
  appId: string,
  to: string,
): Promise<void> {
  const domains = await db
    .select({
      domain: customDomains.domain,
      isCanonical: customDomains.isCanonical,
      verifiedAt: customDomains.verifiedAt,
    })
    .from(customDomains)
    .where(eq(customDomains.appId, appId));
  const canonical = domains.find((row) => row.isCanonical)?.domain;
  for (const domain of domains) {
    if (!domain.verifiedAt) continue;
    await kv.put(
      `custom-domains:${domain.domain.toLowerCase()}`,
      JSON.stringify({
        slug: to,
        is_canonical: domain.isCanonical,
        canonical_domain: canonical ?? domain.domain,
      }),
    );
  }
}

interface MigrationDeps {
  kv: KVNamespace;
  r2: R2Bucket;
  db: ShippieDb;
}

/** Run/resume the state machine from `state.stage`. */
async function drive(deps: MigrationDeps, state: SlugMigrationState): Promise<SlugMigrationState> {
  const { kv, r2, db } = deps;
  let st = state;
  try {
    if (STAGE_ORDER[st.stage] < STAGE_ORDER.r2_copied) {
      await copyR2Prefix(r2, `apps/${st.from}/`, `apps/${st.to}/`);
      st = await writeState(kv, { ...st, stage: 'r2_copied', error: undefined });
    }
    if (STAGE_ORDER[st.stage] < STAGE_ORDER.kv_copied) {
      await copyKvKeys(kv, st.from, st.to, st.name);
      st = await writeState(kv, { ...st, stage: 'kv_copied', error: undefined });
    }
    if (STAGE_ORDER[st.stage] < STAGE_ORDER.verified) {
      if (!(await verifyCopied(kv, st.from, st.to))) {
        throw new Error('runtime slug migration verification failed: new slug missing keys');
      }
      st = await writeState(kv, { ...st, stage: 'verified', error: undefined });
    }
    await repointCustomDomains(kv, db, st.appId, st.to);
    await deleteOldKvKeys(kv, st.from);
    st = { ...st, stage: 'complete', error: undefined, updatedAt: nowIso() };
    await kv.delete(stateKey(st.appId)); // success → clear the state record
    return st;
  } catch (err) {
    return writeState(kv, { ...st, stage: 'failed', error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Start (or restart) a runtime-slug migration. Idempotent: if a prior attempt
 * left a partial state for this app it resumes from there; re-running a
 * completed migration is a no-op-ish copy.
 */
export async function migrateRuntimeSlug(input: {
  kv: KVNamespace;
  r2: R2Bucket;
  db: ShippieDb;
  appId: string;
  from: string;
  to: string;
  name: string;
}): Promise<SlugMigrationState> {
  const existing = await readState(input.kv, input.appId);
  const base: SlugMigrationState =
    existing && existing.to === input.to && existing.from === input.from
      ? existing
      : {
          appId: input.appId,
          from: input.from,
          to: input.to,
          name: input.name,
          stage: 'pending',
          updatedAt: nowIso(),
        };
  const state = await writeState(input.kv, { ...base, name: input.name });
  return drive({ kv: input.kv, r2: input.r2, db: input.db }, state);
}

/**
 * Resume an interrupted migration for an app (the dashboard/admin retry path).
 * Returns null if there's no pending migration to resume.
 */
export async function resumeRuntimeSlugMigration(deps: {
  kv: KVNamespace;
  r2: R2Bucket;
  db: ShippieDb;
  appId: string;
}): Promise<SlugMigrationState | null> {
  const state = await readState(deps.kv, deps.appId);
  if (!state) return null;
  return drive(deps, state);
}

/** Read the current migration state for an app, if any (for surfacing in UI). */
export async function getRuntimeSlugMigrationState(
  kv: KVNamespace,
  appId: string,
): Promise<SlugMigrationState | null> {
  return readState(kv, appId);
}
