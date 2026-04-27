/**
 * /dashboard/apps/[slug]/localize
 *
 * Phase 8 Localize V1 — preview only.
 *
 * Reads the latest deploy's deploy-report.json and surfaces the
 * `localizeOffers` summaries. Per the master plan: source migration,
 * not runtime shim. The maker MUST review the diffs before applying.
 *
 * Apply-side workflow lands in a follow-up — today this page proves
 * Shippie can detect cloud→local transforms and show them honestly.
 */
import { error } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import { deployReportKey } from '$server/deploy/deploy-report';
import type { DeployReport } from '$server/deploy/deploy-report';

export const load: PageServerLoad = async ({ platform, parent }) => {
  if (!platform?.env.DB) throw error(500, 'database unavailable');
  if (!platform?.env.APPS) throw error(500, 'apps bucket unavailable');

  const { app } = await parent();
  const db = getDrizzleClient(platform.env.DB);

  const latest = await db
    .select({
      id: schema.deploys.id,
      version: schema.deploys.version,
      status: schema.deploys.status,
      createdAt: schema.deploys.createdAt,
    })
    .from(schema.deploys)
    .where(eq(schema.deploys.appId, app.id))
    .orderBy(desc(schema.deploys.version))
    .limit(1);

  const deployRow = latest[0] ?? null;

  let report: DeployReport | null = null;
  if (deployRow) {
    const obj = await platform.env.APPS.get(deployReportKey(app.slug, deployRow.version));
    if (obj) {
      try {
        report = JSON.parse(await obj.text()) as DeployReport;
      } catch {
        report = null;
      }
    }
  }

  return {
    deploy: deployRow,
    offers: report?.localizeOffers ?? [],
    kind: report?.kind ?? null,
  };
};
