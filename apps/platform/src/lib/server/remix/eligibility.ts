import { desc, eq } from 'drizzle-orm';
import { schema, type ShippieDb } from '$server/db/client';

export type RemixEligibility =
  | {
      ok: true;
      app: {
        id: string;
        slug: string;
        name: string;
        tagline: string | null;
        sourceRepo: string;
        license: string;
        latestVersion: string | null;
      };
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
      sourceRepo: schema.appLineage.sourceRepo,
      license: schema.appLineage.license,
      remixAllowed: schema.appLineage.remixAllowed,
    })
    .from(schema.apps)
    .leftJoin(schema.appLineage, eq(schema.appLineage.appId, schema.apps.id))
    .where(eq(schema.apps.slug, slug))
    .limit(1);

  if (!row || row.isArchived || row.visibilityScope !== 'public') {
    return { ok: false, reason: 'This app is not publicly remixable.' };
  }

  const sourceRepo = row.sourceRepo ?? row.githubRepo;
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
    },
  };
}
