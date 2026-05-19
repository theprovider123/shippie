/**
 * POST /api/deploy/wrap
 *
 * URL-wrap deploys are retired for the public Shippie maker path.
 * A reverse-proxied cloud app cannot be statically verified as local,
 * private, offline, and no-login, so it cannot wear the Shippie marketplace
 * promise. Makers should upload a built local tool zip, use the CLI/MCP
 * deploy path, or convert the hosted app to Shippie local primitives first.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$server/auth/resolve-user';

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB || !env?.CACHE) throw error(500, 'platform bindings unavailable');

  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthenticated' }, { status: 401 });

  return json(
    {
      error: 'wrap_retired',
      reason:
        'URL wraps are retired for Shippie marketplace deploys. Shippie tools must be local-first: no external login, no third-party user-data storage, and no silent user-data egress. Upload a built zip or deploy from the CLI/MCP path so the local-tool policy scanner can verify the bundle.',
      alternatives: [
        'Upload a built dist/, build/, or out/ folder as a zip.',
        'Run shippie deploy ./dist from the CLI.',
        'Use the Shippie MCP deploy tool from your editor.',
        'Convert the hosted app to shippie.local.db / shippie.local.files before publishing.',
      ],
    },
    { status: 410 },
  );
};
