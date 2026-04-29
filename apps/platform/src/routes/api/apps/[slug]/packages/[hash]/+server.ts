import { and, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';

export const GET: RequestHandler = async ({ params, platform }) => {
  if (!platform?.env.DB || !platform.env.APPS) {
    throw error(503, 'Package storage unavailable');
  }

  const packageHash = params.hash.startsWith('sha256:')
    ? params.hash
    : `sha256:${params.hash}`;
  if (!/^sha256:[a-f0-9]{64}$/i.test(packageHash)) {
    throw error(400, 'Invalid package hash');
  }

  const db = getDrizzleClient(platform.env.DB);
  const [row] = await db
    .select({
      appName: schema.apps.name,
      slug: schema.apps.slug,
      visibilityScope: schema.apps.visibilityScope,
      isArchived: schema.apps.isArchived,
      packageHash: schema.appPackages.packageHash,
      artifactPrefix: schema.appPackages.artifactPrefix,
    })
    .from(schema.appPackages)
    .innerJoin(schema.apps, eq(schema.apps.id, schema.appPackages.appId))
    .where(and(eq(schema.apps.slug, params.slug), eq(schema.appPackages.packageHash, packageHash)))
    .limit(1);

  if (!row || row.visibilityScope !== 'public' || row.isArchived) {
    throw error(404, 'Package not found');
  }

  const key = `${row.artifactPrefix}/${row.packageHash}.shippie`;
  const obj = await platform.env.APPS.get(key);
  if (!obj) throw error(404, 'Package archive missing');

  return new Response(await obj.arrayBuffer(), {
    headers: {
      'content-type': 'application/vnd.shippie.package+json',
      'content-disposition': `attachment; filename="${row.slug}-${row.packageHash.slice(7, 19)}.shippie"`,
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};
