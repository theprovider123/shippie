/**
 * /dashboard/apps/[slug]/deploys/[deployId]
 *
 * Phase 4 Stage A — maker-facing deploy report page.
 *
 * Reads the deploy-report.json artifact from R2 (apps/{slug}/v{ver}/
 * _shippie/deploy-report.json) and renders the security findings,
 * privacy domains, kind classification, and (Stage A internal) score
 * + grade.
 *
 * Auth posture: the parent +layout.server.ts already verified the user
 * is the maker of this app. We just need to confirm the deploy belongs
 * to this app.
 */
import { error } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { getDrizzleClient, schema } from '$server/db/client';
import type { DeployReport } from '$server/deploy/deploy-report';
import { deployReportKey } from '$server/deploy/deploy-report';
import { deployEventsKey } from '$server/deploy/deploy-events';

export const load: PageServerLoad = async ({ platform, params, parent }) => {
  if (!platform?.env.DB) throw error(500, 'database unavailable');
  if (!platform?.env.APPS) throw error(500, 'apps bucket unavailable');

  const { app } = await parent();
  const db = getDrizzleClient(platform.env.DB);

  const deployRow = await db.query.deploys.findFirst({
    where: and(
      eq(schema.deploys.id, params.deployId),
      eq(schema.deploys.appId, app.id),
    ),
  });
  if (!deployRow) throw error(404, 'deploy not found');

  // Fetch the report artifact. Older deploys (pre-Phase 2) won't have
  // one — surface that gracefully rather than 500ing.
  const reportObj = await platform.env.APPS.get(
    deployReportKey(app.slug, deployRow.version),
  );
  let report: DeployReport | null = null;
  if (reportObj) {
    try {
      const text = await reportObj.text();
      report = JSON.parse(text) as DeployReport;
    } catch {
      report = null;
    }
  }

  // Quick check: do we also have an events stream available?
  const eventsObj = await platform.env.APPS.head(
    deployEventsKey(app.slug, deployRow.version),
  );

  return {
    deploy: {
      id: deployRow.id,
      version: deployRow.version,
      status: deployRow.status,
      sourceType: deployRow.sourceType,
      createdAt: deployRow.createdAt,
      completedAt: deployRow.completedAt,
      durationMs: deployRow.durationMs,
      commitSha: deployRow.commitSha,
    },
    report,
    hasStream: eventsObj !== null,
  };
};
