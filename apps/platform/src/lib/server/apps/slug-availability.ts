import { eq } from 'drizzle-orm';
import { isFirstPartyShowcase } from '$lib/showcase-slugs';
import { schema, type ShippieDb } from '$server/db/client';

export const APP_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type SlugAvailabilityReason =
  | 'available'
  | 'invalid'
  | 'reserved'
  | 'first_party'
  | 'active_app'
  | 'retired_alias'
  | 'legacy_redirect';

export type SlugAvailability = {
  slug: string;
  available: boolean;
  reason: SlugAvailabilityReason;
  ownerAppId?: string | null;
  targetSlug?: string | null;
};

export type SlugAvailabilityOptions = {
  excludeSlug?: string | null;
  excludeAppId?: string | null;
  reservedSlugs?: ReadonlySet<string>;
};

export function normalizeAppSlug(value: string): string {
  return value.trim().toLowerCase();
}

export async function checkAppSlugAvailability(
  db: ShippieDb,
  rawSlug: string,
  options: SlugAvailabilityOptions = {},
): Promise<SlugAvailability> {
  const slug = normalizeAppSlug(rawSlug);
  if (!APP_SLUG_RE.test(slug)) return { slug, available: false, reason: 'invalid' };

  const excludeAppId = options.excludeAppId ?? await appIdForSlug(db, options.excludeSlug);
  if (isFirstPartyShowcase(slug)) return { slug, available: false, reason: 'first_party' };

  if (options.reservedSlugs?.has(slug) ?? await isReservedSlug(db, slug)) {
    return { slug, available: false, reason: 'reserved' };
  }

  const [active] = await db
    .select({ id: schema.apps.id })
    .from(schema.apps)
    .where(eq(schema.apps.slug, slug))
    .limit(1);
  if (active && active.id !== excludeAppId) {
    return { slug, available: false, reason: 'active_app', ownerAppId: active.id };
  }

  const [alias] = await db
    .select({
      appId: schema.appSlugAliases.appId,
      targetSlug: schema.appSlugAliases.targetSlug,
    })
    .from(schema.appSlugAliases)
    .where(eq(schema.appSlugAliases.slug, slug))
    .limit(1);
  if (alias && alias.appId !== excludeAppId) {
    return {
      slug,
      available: false,
      reason: 'retired_alias',
      ownerAppId: alias.appId,
      targetSlug: alias.targetSlug,
    };
  }

  const [legacyRedirect] = await db
    .select({ targetSlug: schema.appSlugRedirects.newSlug })
    .from(schema.appSlugRedirects)
    .where(eq(schema.appSlugRedirects.oldSlug, slug))
    .limit(1);
  if (legacyRedirect && legacyRedirect.targetSlug !== options.excludeSlug) {
    return {
      slug,
      available: false,
      reason: 'legacy_redirect',
      targetSlug: legacyRedirect.targetSlug,
    };
  }

  return { slug, available: true, reason: 'available', ownerAppId: excludeAppId ?? null };
}

async function appIdForSlug(db: ShippieDb, slug: string | null | undefined): Promise<string | null> {
  if (!slug) return null;
  const normalized = normalizeAppSlug(slug);
  if (!APP_SLUG_RE.test(normalized)) return null;
  const [app] = await db
    .select({ id: schema.apps.id })
    .from(schema.apps)
    .where(eq(schema.apps.slug, normalized))
    .limit(1);
  return app?.id ?? null;
}

async function isReservedSlug(db: ShippieDb, slug: string): Promise<boolean> {
  const [reserved] = await db
    .select({ slug: schema.reservedSlugs.slug })
    .from(schema.reservedSlugs)
    .where(eq(schema.reservedSlugs.slug, slug))
    .limit(1);
  return Boolean(reserved);
}
