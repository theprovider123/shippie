import { desc, eq } from 'drizzle-orm';
import { schema, type ShippieDb } from '$server/db/client';
import { curationFor } from '$lib/_generated/first-party-curation';
import { canonicalShowcaseSlug, isFirstPartyShowcase } from '$lib/showcase-slugs';
import { normalizeSourceRepo } from './source-repo';

export interface RemixableApp {
  id: string | null;
  slug: string;
  name: string;
  tagline: string | null;
  templateId?: string | null;
  sourceRepo: string;
  license: string;
  latestVersion: string | null;
  /**
   * The parent app's durable data family (apps.data_family, locked on first
   * deploy — see deploy/data-family.ts). Surfaced so a remix can tell whether
   * it can read the parent's saved data. Null when unknown (e.g. a first-party
   * catalog entry with no DB row yet).
   */
  dataFamily: string | null;
}

export type RemixEligibility =
  | {
      ok: true;
      app: RemixableApp;
    }
  | { ok: false; reason: string };

export async function remixEligibilityForSlug(
  db: ShippieDb,
  slug: string,
): Promise<RemixEligibility> {
  const [row] = await db
    .select({
      id: schema.apps.id,
      slug: schema.apps.slug,
      name: schema.apps.name,
      tagline: schema.apps.tagline,
      visibilityScope: schema.apps.visibilityScope,
      isArchived: schema.apps.isArchived,
      githubRepo: schema.apps.githubRepo,
      dataFamily: schema.apps.dataFamily,
      sourceRepo: schema.appLineage.sourceRepo,
      license: schema.appLineage.license,
      remixAllowed: schema.appLineage.remixAllowed,
    })
    .from(schema.apps)
    .leftJoin(schema.appLineage, eq(schema.appLineage.appId, schema.apps.id))
    .where(eq(schema.apps.slug, slug))
    .limit(1);

  if (!row) {
    const firstParty = firstPartyCatalogRemix(slug);
    if (firstParty) return { ok: true, app: firstParty };
    return { ok: false, reason: 'This app is not publicly remixable.' };
  }
  if (row.isArchived || row.visibilityScope !== 'public') {
    return { ok: false, reason: 'This app is not publicly remixable.' };
  }

  // First-party showcases live in the public Shippie monorepo under
  // AGPL-3.0-or-later. The maker-controlled lineage row can't override
  // that — source/license are properties of the monorepo, not the
  // claimed app row. Always prefer first-party defaults when the slug
  // is in the first-party catalog and isn't archived.
  if (isFirstPartyShowcase(row.slug)) {
    const curation = curationFor(row.slug);
    if (curation?.surface !== 'archived' && curation?.visibility === 'public') {
      return {
        ok: true,
        app: {
          id: row.id,
          slug: row.slug,
          name: row.name,
          tagline: row.tagline,
          templateId: firstPartyTemplateId(row.slug),
          sourceRepo: firstPartySourceRepo(row.slug),
          license: 'AGPL-3.0-or-later',
          latestVersion: null,
          dataFamily: row.dataFamily ?? null,
        },
      };
    }
  }

  const sourceRepo = normalizeSourceRepo(row.sourceRepo ?? row.githubRepo)?.webUrl;
  if (!row.remixAllowed || !sourceRepo || !row.license) {
    return { ok: false, reason: 'The maker has not published source, license, and remix terms.' };
  }

  const [pkg] = await db
    .select({ version: schema.appPackages.version })
    .from(schema.appPackages)
    .where(eq(schema.appPackages.appId, row.id))
    .orderBy(desc(schema.appPackages.createdAt))
    .limit(1);

  return {
    ok: true,
    app: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      tagline: row.tagline,
      sourceRepo,
      license: row.license,
      latestVersion: pkg?.version ?? null,
      dataFamily: row.dataFamily ?? null,
    },
  };
}

/**
 * Public-page-facing wrapper over `remixEligibilityForSlug`. Returns
 * the shape the `/apps/[slug]` page needs to render the source link,
 * license badge, and "Remix this app" CTA. Single source of truth so
 * the public page and the `/api/apps/[slug]/remix` endpoint can't
 * disagree on whether an app is remixable.
 *
 * `remixVia` hints how the CTA should resolve: `'cli'` for first-party
 * showcases (whose source lives in the monorepo and is cloned via
 * `npx @shippie/cli remix <slug>`), `'web'` for everything else (the
 * `/new?remix=<slug>` flow).
 */
export interface PublicRemixInfo {
  sourceRepo: string | null;
  license: string | null;
  remixAvailable: boolean;
  remixVia: 'cli' | 'web';
  /** Parent app's durable data family, so the remix CTA can explain inheritance. */
  dataFamily: string | null;
}

export async function publicRemixInfoForSlug(
  db: ShippieDb,
  slug: string,
): Promise<PublicRemixInfo> {
  const eligibility = await remixEligibilityForSlug(db, slug);
  const firstParty = isFirstPartyShowcase(slug);
  if (!eligibility.ok) {
    return {
      sourceRepo: null,
      license: null,
      remixAvailable: false,
      remixVia: firstParty ? 'cli' : 'web',
      dataFamily: null,
    };
  }
  return {
    sourceRepo: eligibility.app.sourceRepo,
    license: eligibility.app.license,
    remixAvailable: true,
    remixVia: firstParty ? 'cli' : 'web',
    dataFamily: eligibility.app.dataFamily,
  };
}

function firstPartyCatalogRemix(slug: string): RemixableApp | null {
  if (!isFirstPartyShowcase(slug)) return null;
  const requested = curationFor(slug);
  if (requested && (requested.surface === 'archived' || requested.visibility !== 'public')) return null;
  const canonical = canonicalShowcaseSlug(slug);
  const curation = curationFor(canonical);
  if (curation?.surface === 'archived' || curation?.visibility !== 'public') return null;
  return {
    id: null,
    slug: canonical,
    name: titleFromSlug(canonical),
    tagline: null,
    templateId: firstPartyTemplateId(canonical),
    sourceRepo: firstPartySourceRepo(canonical),
    license: 'AGPL-3.0-or-later',
    latestVersion: null,
    dataFamily: null,
  };
}

function firstPartyTemplateId(slug: string): string {
  return `showcase:${canonicalShowcaseSlug(slug)}`;
}

function firstPartySourceRepo(slug: string): string {
  return `https://github.com/theprovider123/shippie/tree/main/apps/showcase-${canonicalShowcaseSlug(slug)}`;
}

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
