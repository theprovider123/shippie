import { schema, type ShippieDb } from '@shippie/db';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';

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
  reservedSlugs: ReadonlySet<string>;
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

function publicHost(): string {
  return process.env.SHIPPIE_PUBLIC_HOST ?? 'shippie.app';
}

export async function createWrappedApp(
  input: CreateWrappedAppInput,
): Promise<CreateWrappedAppResult> {
  if (!input.upstreamUrl.startsWith('https://')) {
    return { success: false, reason: 'upstream_not_https' };
  }
  if (input.reservedSlugs.has(input.slug)) {
    return { success: false, reason: 'slug_reserved' };
  }

  const db: ShippieDb = await getDb();
  const existing = await db
    .select({ id: schema.apps.id, makerId: schema.apps.makerId })
    .from(schema.apps)
    .where(eq(schema.apps.slug, input.slug))
    .limit(1);
  if (existing[0] && existing[0].makerId !== input.makerId) {
    return { success: false, reason: 'slug_taken' };
  }

  const host = publicHost();
  const runtimeOrigin = `https://${input.slug}.${host}`;
  const liveUrl = `${runtimeOrigin}/`;

  const [appRow] = await db
    .insert(schema.apps)
    .values({
      slug: input.slug,
      name: input.name,
      tagline: input.tagline ?? null,
      type: input.type,
      category: input.category,
      makerId: input.makerId,
      sourceType: 'zip', // legacy field, not meaningful for wrapped
      sourceKind: 'wrapped_url',
      upstreamUrl: input.upstreamUrl,
      upstreamConfig: {
        cspMode: input.cspMode ?? 'lenient',
      },
      themeColor: input.themeColor ?? '#E8603C',
    })
    .onConflictDoUpdate({
      target: schema.apps.slug,
      set: {
        sourceKind: 'wrapped_url',
        upstreamUrl: input.upstreamUrl,
        upstreamConfig: { cspMode: input.cspMode ?? 'lenient' },
        updatedAt: new Date(),
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
    })
    .returning({ id: schema.deploys.id });

  if (!deployRow) return { success: false, reason: 'deploy_insert_failed' };

  await db
    .update(schema.apps)
    .set({ activeDeployId: deployRow.id, lastDeployedAt: new Date() })
    .where(eq(schema.apps.id, appRow.id));

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
