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
import { remixEligibilityForSlug } from '$server/remix/eligibility';

export const GET: RequestHandler = async ({ params, platform }) => {
  if (!platform?.env.DB) {
    return json({ error: 'database_unavailable' }, { status: 500 });
  }

  const slug = params.slug?.trim();
  if (!slug || !/^[a-z0-9-]{1,63}$/.test(slug)) {
    return json({ error: 'invalid_slug' }, { status: 400 });
  }

  const eligibility = await remixEligibilityForSlug(getDrizzleClient(platform.env.DB), slug);
  if (!eligibility.ok) {
    return json({ error: 'remix_unavailable', reason: eligibility.reason }, { status: 400 });
  }

  const app = eligibility.app;
  const targetSlug = `${app.slug}-remix`;

  return json({
    remix: {
      slug: app.slug,
      name: app.name,
      tagline: app.tagline,
      sourceRepo: app.sourceRepo,
      license: app.license,
      latestVersion: app.latestVersion,
      forkUrl: githubForkUrl(app.sourceRepo),
      deploy: {
        cli: `shippie deploy ./dist --slug ${targetSlug} --remix ${app.slug}`,
        mcp: {
          tool: 'deploy',
          arguments: {
            directory: '/absolute/path/to/dist',
            slug: targetSlug,
            remix_from: app.slug,
          },
        },
        workspace: {
          slug: targetSlug,
          directory: 'dist',
          remixFrom: app.slug,
        },
      },
    },
  });
};

function githubForkUrl(sourceRepo: string): string | null {
  try {
    const url = new URL(sourceRepo);
    if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return null;
    return `${sourceRepo.replace(/\/$/, '').replace(/\.git$/, '')}/fork`;
  } catch {
    return null;
  }
}
