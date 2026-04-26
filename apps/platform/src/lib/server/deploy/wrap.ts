/**
 * Wrap-mode deploy — register an upstream URL as a Shippie app without
 * uploading any files. Worker-friendly port of apps/web/lib/deploy/wrap.ts.
 *
 * The Worker's wrapper rewriter dispatches on KV key `apps:{slug}:wrap`
 * to decide whether to reverse-proxy the request.
 */
import { eq } from 'drizzle-orm';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { getDrizzleClient, schema } from '../db/client';
import { writeWrapMeta, writeAppMeta } from './kv-write';
import { resolveLiveUrl } from './pipeline';

export interface CreateWrappedAppInput {
  slug: string;
  makerId: string;
  upstreamUrl: string;
  name: string;
  tagline?: string;
  type: 'app' | 'web_app' | 'website';
  category: string;
  cspMode?: 'lenient' | 'strict';
  themeColor?: string;
  visibilityScope?: 'public' | 'unlisted' | 'private';
  reservedSlugs: ReadonlySet<string>;
  db: D1Database;
  kv: KVNamespace;
  publicOrigin: string;
}

export type CreateWrappedAppResult =
  | {
      success: true;
      slug: string;
      appId: string;
      deployId: string;
      liveUrl: string;
      runtimeConfig: { requiredRedirectUris: string[] };
    }
  | { success: false; reason: string };

export async function createWrappedApp(input: CreateWrappedAppInput): Promise<CreateWrappedAppResult> {
  if (!input.upstreamUrl.startsWith('https://')) {
    return { success: false, reason: 'upstream_not_https' };
  }
  if (input.reservedSlugs.has(input.slug)) {
    return { success: false, reason: 'slug_reserved' };
  }

  const db = getDrizzleClient(input.db);
  const existing = await db
    .select({ id: schema.apps.id, makerId: schema.apps.makerId })
    .from(schema.apps)
    .where(eq(schema.apps.slug, input.slug))
    .limit(1);
  if (existing[0] && existing[0].makerId !== input.makerId) {
    return { success: false, reason: 'slug_taken' };
  }

  const [appRow] = await db
    .insert(schema.apps)
    .values({
      slug: input.slug,
      name: input.name,
      tagline: input.tagline ?? null,
      type: input.type,
      category: input.category,
      makerId: input.makerId,
      sourceType: 'zip',
      sourceKind: 'wrapped_url',
      upstreamUrl: input.upstreamUrl,
      upstreamConfig: { cspMode: input.cspMode ?? 'lenient' },
      themeColor: input.themeColor ?? '#E8603C',
      visibilityScope: input.visibilityScope ?? 'public',
    })
    .onConflictDoUpdate({
      target: schema.apps.slug,
      set: {
        sourceKind: 'wrapped_url',
        upstreamUrl: input.upstreamUrl,
        upstreamConfig: { cspMode: input.cspMode ?? 'lenient' },
        updatedAt: new Date().toISOString(),
      },
    })
    .returning({ id: schema.apps.id });

  if (!appRow) return { success: false, reason: 'insert_failed' };

  const [deployRow] = await db
    .insert(schema.deploys)
    .values({
      appId: appRow.id,
      status: 'success',
      version: 1,
      sourceType: 'wrapped_url',
      sourceKind: 'wrapped_url',
      sourceRef: input.upstreamUrl,
      createdBy: input.makerId,
    })
    .returning({ id: schema.deploys.id });

  if (!deployRow) return { success: false, reason: 'deploy_insert_failed' };

  const completedAt = new Date().toISOString();
  await db
    .update(schema.apps)
    .set({
      activeDeployId: deployRow.id,
      latestDeployId: deployRow.id,
      latestDeployStatus: 'success',
      lastDeployedAt: completedAt,
    })
    .where(eq(schema.apps.id, appRow.id));

  // KV writes — must land before we return so the first request to the
  // subdomain sees the wrap config rather than falling through to 404.
  await writeWrapMeta(input.kv, input.slug, {
    upstream_url: input.upstreamUrl,
    csp_mode: input.cspMode ?? 'lenient',
  });
  await writeAppMeta(input.kv, input.slug, {
    slug: input.slug,
    name: input.name,
    type: input.type,
    theme_color: input.themeColor ?? '#E8603C',
    background_color: '#ffffff',
    version: 1,
    visibility_scope: input.visibilityScope ?? 'public',
  });

  const liveUrl = resolveLiveUrl(input.publicOrigin, input.slug);
  // requiredRedirectUris is informational — surfaces in the SuccessCard
  // so makers know which redirect to add to Supabase/Auth0/Clerk.
  const runtimeOrigin = liveUrl.replace(/\/$/, '');

  return {
    success: true,
    slug: input.slug,
    appId: appRow.id,
    deployId: deployRow.id,
    liveUrl,
    runtimeConfig: {
      requiredRedirectUris: [`${runtimeOrigin}/api/auth/callback`],
    },
  };
}
