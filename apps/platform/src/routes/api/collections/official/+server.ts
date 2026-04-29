import { and, desc, eq, inArray } from 'drizzle-orm';
import { json, type RequestHandler } from '@sveltejs/kit';
import {
  SHIPPIE_COLLECTION_SCHEMA,
  assertValidCollectionManifest,
  type AppCollectionManifest,
} from '@shippie/app-package-contract';
import { getDrizzleClient, schema } from '$server/db/client';

export const GET: RequestHandler = async ({ platform, url }) => {
  if (!platform?.env.DB) {
    return json(emptyCollection(url.origin));
  }

  const db = getDrizzleClient(platform.env.DB);
  try {
    const rows = await db
      .select({
        appId: schema.apps.id,
        slug: schema.apps.slug,
        name: schema.apps.name,
        description: schema.apps.description,
        iconUrl: schema.apps.iconUrl,
        kind: schema.apps.currentDetectedKind,
        version: schema.appPackages.version,
        packageHash: schema.appPackages.packageHash,
        manifestPath: schema.appPackages.manifestPath,
        createdAt: schema.appPackages.createdAt,
      })
      .from(schema.appPackages)
      .innerJoin(schema.apps, eq(schema.apps.id, schema.appPackages.appId))
      .where(
        and(
          inArray(schema.appPackages.containerEligibility, [
            'first_party',
            'curated',
            'compatible',
          ]),
          eq(schema.apps.visibilityScope, 'public'),
          eq(schema.apps.isArchived, false),
        ),
      )
      .orderBy(desc(schema.appPackages.createdAt))
      .limit(50);

    const collection: AppCollectionManifest = {
      ...emptyCollection(url.origin),
      updatedAt: rows[0]?.createdAt ?? new Date().toISOString(),
      packages: rows.map((row) => ({
        appId: row.appId,
        slug: row.slug,
        name: row.name,
        version: row.version,
        kind: row.kind === 'local' || row.kind === 'connected' || row.kind === 'cloud' ? row.kind : 'connected',
        packageHash: row.packageHash,
        packageUrl: `${url.origin}/api/apps/${row.slug}/packages/${encodeURIComponent(row.packageHash)}`,
        domains: [`${url.origin}/apps/${row.slug}`],
        iconUrl: publicAssetUrl(url.origin, row.iconUrl),
        summary: row.description ?? undefined,
      })),
    };
    assertValidCollectionManifest(collection);
    return json(collection, {
      headers: {
        'cache-control': 'public, max-age=60, stale-while-revalidate=300',
      },
    });
  } catch {
    return json(emptyCollection(url.origin));
  }
};

function emptyCollection(origin: string): AppCollectionManifest {
  const now = new Date().toISOString();
  return {
    schema: SHIPPIE_COLLECTION_SCHEMA,
    id: 'collection_official',
    slug: 'official',
    name: 'Official Shippie Collection',
    description: 'Container-ready apps mirrored from the public Shippie package registry.',
    kind: 'official',
    createdAt: now,
    updatedAt: now,
    publisher: {
      id: 'shippie',
      name: 'Shippie',
      profileUrl: origin,
    },
    sourceUrl: `${origin}/api/collections/official`,
    packages: [],
  };
}

function publicAssetUrl(origin: string, value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, origin).href;
  } catch {
    return undefined;
  }
}
