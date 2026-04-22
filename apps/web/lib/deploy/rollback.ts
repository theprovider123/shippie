/**
 * App rollback — point `apps.activeDeployId` at a prior successful
 * deploy and re-write the KV `active` + `csp` entries.
 *
 * Since migration 0014, each successful deploy persists the per-app
 * CSP header it was built with (`deploys.csp_header`). Rollback reads
 * that stored value and writes it back into `apps:{slug}:csp` so the
 * worker serves the CSP that matches the version it's serving — no
 * "redeploy to refresh" hint needed for deploys built after 0014.
 *
 * `meta` is still not rewritten. Its surface-level drift (theme color,
 * manifest name) is cosmetic and the worker has a graceful fallback.
 * A future migration could persist meta too; not yet worth it.
 *
 * DB is source of truth. The reconcile-kv cron (lib/deploy/reconcile-kv.ts)
 * heals any KV `active` pointer drift. CSP isn't yet reconciled there —
 * rollback is the only non-hot-path that writes it today.
 */
import { and, eq } from 'drizzle-orm';
import { schema } from '@shippie/db';
import { DevKv, getDevKvDir } from '@shippie/dev-storage';
import type { KvStore } from '@shippie/dev-storage';
import { getDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';

export type RollbackInput = {
  slug: string;
  actorUserId: string;
  /** Injected for tests; defaults to the module-global Drizzle client. */
  db?: Awaited<ReturnType<typeof getDb>>;
  /** Injected for tests; defaults to a `DevKv` over the repo's dev state dir. */
  kv?: KvStore;
} & (
  | { targetVersion: number; to?: never }
  | { targetVersion?: never; to: 'previous' }
);

export type RollbackResult =
  | {
      success: true;
      slug: string;
      from_version: number | null;
      to_version: number;
      deploy_id: string;
      /** true when the target deploy predates 0014 and has no stored CSP —
       *  rollback left the previous version's CSP in place; redeploy to
       *  refresh. false when CSP was rewritten from the stored header. */
      csp_stale: boolean;
    }
  | { success: false; reason: string };

export async function rollbackApp(input: RollbackInput): Promise<RollbackResult> {
  const db = input.db ?? (await getDb());

  const app = await db.query.apps.findFirst({
    where: eq(schema.apps.slug, input.slug),
  });
  if (!app) return { success: false, reason: 'app_not_found' };
  if (app.makerId !== input.actorUserId) {
    return { success: false, reason: 'forbidden' };
  }

  // Look up the current active deploy so we can resolve "previous" and
  // report which version the rollback moved off of.
  let currentVersion: number | null = null;
  if (app.activeDeployId) {
    const current = await db.query.deploys.findFirst({
      where: eq(schema.deploys.id, app.activeDeployId),
    });
    currentVersion = current?.version ?? null;
  }

  let target:
    | { id: string; version: number; cspHeader: string | null }
    | undefined;

  if ('to' in input && input.to === 'previous') {
    const candidates = await db
      .select({
        id: schema.deploys.id,
        version: schema.deploys.version,
        cspHeader: schema.deploys.cspHeader,
      })
      .from(schema.deploys)
      .where(
        and(
          eq(schema.deploys.appId, app.id),
          eq(schema.deploys.status, 'success'),
        ),
      )
      .orderBy(schema.deploys.version);
    const lowerVersions = candidates.filter(
      (d) => currentVersion == null || d.version < currentVersion,
    );
    target = lowerVersions[lowerVersions.length - 1];
    if (!target) {
      return { success: false, reason: 'no_previous_deploy' };
    }
  } else {
    const row = await db.query.deploys.findFirst({
      where: and(
        eq(schema.deploys.appId, app.id),
        eq(schema.deploys.version, input.targetVersion!),
      ),
    });
    if (!row) return { success: false, reason: 'version_not_found' };
    if (row.status !== 'success') {
      return { success: false, reason: 'version_not_successful' };
    }
    target = { id: row.id, version: row.version, cspHeader: row.cspHeader };
  }

  if (target.version === currentVersion) {
    return { success: false, reason: 'already_active' };
  }

  // DB is source of truth — flip activeDeployId first.
  await db
    .update(schema.apps)
    .set({ activeDeployId: target.id, updatedAt: new Date() })
    .where(eq(schema.apps.id, app.id));

  const kv = input.kv ?? new DevKv(getDevKvDir());

  // Write CSP first (worker reads it independently from the active
  // pointer), then flip the pointer. Same reasoning as the deploy hot
  // path: the worker serves a coherent view during the non-atomic
  // sequence.
  const cspRewritten = target.cspHeader != null;
  if (cspRewritten) {
    await kv.put(`apps:${input.slug}:csp`, target.cspHeader!);
  }
  await kv.put(`apps:${input.slug}:active`, String(target.version));

  await writeAuditLog(db, {
    actorUserId: input.actorUserId,
    action: 'app.rollback',
    targetType: 'app',
    targetId: app.id,
    metadata: {
      slug: input.slug,
      from_version: currentVersion,
      to_version: target.version,
      csp_rewritten: cspRewritten,
    },
  });

  return {
    success: true,
    slug: input.slug,
    from_version: currentVersion,
    to_version: target.version,
    deploy_id: target.id,
    csp_stale: !cspRewritten,
  };
}
