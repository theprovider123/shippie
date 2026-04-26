/**
 * POST /api/deploy/path
 *
 * Local-directory deploy from CLI. In v0 of the SvelteKit port, host
 * builds aren't supported in the Worker (no subprocess execution). The
 * CLI should switch to packaging a zip locally and POSTing to /api/deploy.
 *
 * This endpoint returns 503 to signal the CLI to fall back. Contract
 * preserved so the CLI keeps working — the CLI's existing fallback
 * already handles the `host_builds_disabled` reason.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
  return json(
    {
      error: 'host_builds_disabled',
      reason: 'Host-side builds are not available on Cloudflare Workers. CLI: please zip the build output locally and POST to /api/deploy.',
    },
    { status: 503 },
  );
};
