import type { KVNamespace } from '@cloudflare/workers-types';
import { eq } from 'drizzle-orm';
import type { ShippieDb } from '$server/db/client';
import { schema } from '$server/db/client';
import { patchAppMeta } from '$server/deploy/kv-write';

export const APP_VISIBILITY_SCOPES = ['public', 'unlisted', 'private', 'team'] as const;
export const ADMIN_APP_VISIBILITY_SCOPES = ['public', 'unlisted', 'private'] as const;

export type AppVisibilityScope = (typeof APP_VISIBILITY_SCOPES)[number];
export type AdminAppVisibilityScope = (typeof ADMIN_APP_VISIBILITY_SCOPES)[number];

export interface AppVisibilityTarget {
  id: string;
  slug: string;
  visibilityScope: string;
  organizationId?: string | null;
}

export interface SetAppVisibilityInput {
  db: ShippieDb;
  cache?: KVNamespace | null;
  app: AppVisibilityTarget;
  visibility: AppVisibilityScope;
  organizationId?: string | null;
}

export interface SetAppVisibilityResult {
  changed: boolean;
  metadataSynced: boolean;
  before: {
    visibilityScope: string;
    organizationId: string | null;
  };
  after: {
    visibilityScope: AppVisibilityScope;
    organizationId: string | null;
  };
}

export function isAppVisibilityScope(value: unknown): value is AppVisibilityScope {
  return typeof value === 'string' && APP_VISIBILITY_SCOPES.includes(value as AppVisibilityScope);
}

export function isAdminAppVisibilityScope(value: unknown): value is AdminAppVisibilityScope {
  return typeof value === 'string' && ADMIN_APP_VISIBILITY_SCOPES.includes(value as AdminAppVisibilityScope);
}

export async function setAppVisibility(input: SetAppVisibilityInput): Promise<SetAppVisibilityResult> {
  const before = {
    visibilityScope: input.app.visibilityScope,
    organizationId: input.app.organizationId ?? null,
  };
  const organizationId =
    input.organizationId === undefined ? before.organizationId : input.organizationId;
  const after = {
    visibilityScope: input.visibility,
    organizationId: organizationId ?? null,
  };
  const changed =
    before.visibilityScope !== after.visibilityScope || before.organizationId !== after.organizationId;

  if (changed) {
    await input.db
      .update(schema.apps)
      .set({
        visibilityScope: after.visibilityScope,
        organizationId: after.organizationId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.apps.id, input.app.id));
  }

  if (!input.cache) {
    return {
      changed,
      metadataSynced: false,
      before,
      after,
    };
  }

  let patched = false;
  try {
    patched = await patchAppMeta(input.cache, input.app.slug, {
      slug: input.app.slug,
      visibility_scope: after.visibilityScope,
      organization_id: after.organizationId ?? undefined,
    });
  } catch (err) {
    if (changed) {
      await input.db
        .update(schema.apps)
        .set({
          visibilityScope: before.visibilityScope,
          organizationId: before.organizationId,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.apps.id, input.app.id))
        .catch((rollbackErr: unknown) => {
          console.error('[apps:visibility] failed to roll back D1 after KV sync failure', rollbackErr);
        });
    }
    throw err;
  }

  // patched=false means the app has no meta blob (never deployed) — it
  // isn't serving, so D1 alone is correct; report unsynced and let the
  // reconcile-kv cron converge once a deploy writes the blob.
  return {
    changed,
    metadataSynced: patched,
    before,
    after,
  };
}
