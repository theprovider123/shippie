/**
 * Per-app overview — recent deploys + visibility.
 */
import { desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';

export const load: PageServerLoad = async ({ parent, platform }) => {
  const layout = await parent();
  if (!platform?.env.DB) return { ...layout, deploys: [] };

  const db = getDrizzleClient(platform.env.DB);
  const deploys = await db
    .select({
      id: schema.deploys.id,
      version: schema.deploys.version,
      status: schema.deploys.status,
      sourceType: schema.deploys.sourceType,
      durationMs: schema.deploys.durationMs,
      createdAt: schema.deploys.createdAt,
      completedAt: schema.deploys.completedAt,
    })
    .from(schema.deploys)
    .where(eq(schema.deploys.appId, layout.app.id))
    .orderBy(desc(schema.deploys.createdAt))
    .limit(10);

  return { ...layout, deploys };
};
