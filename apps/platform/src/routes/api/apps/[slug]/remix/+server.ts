/**
 * GET /api/apps/:slug/remix
 *
 * Public remix handoff for CLI/MCP/agents. It returns only the source,
 * license, and deploy hints needed to fork or clone a remixable app and
 * redeploy it with lineage preserved.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDrizzleClient } from '$server/db/client';
import { loadReservedSlugs } from '$server/deploy/reserved-slugs';
import { remixHandoffForSlug } from '$server/remix/handoff';

export const GET: RequestHandler = async ({ params, platform }) => {
  if (!platform?.env.DB) {
    return json({ error: 'database_unavailable' }, { status: 500 });
  }

  const slug = params.slug?.trim();
  if (!slug || !/^[a-z0-9-]{1,63}$/.test(slug)) {
    return json({ error: 'invalid_slug' }, { status: 400 });
  }

  const reservedSlugs = await loadReservedSlugs(platform.env.DB);
  const handoff = await remixHandoffForSlug(getDrizzleClient(platform.env.DB), slug, { reservedSlugs });
  if (!handoff.ok) {
    return json({ error: 'remix_unavailable', reason: handoff.reason }, { status: 400 });
  }

  return json({ remix: handoff.remix });
};
