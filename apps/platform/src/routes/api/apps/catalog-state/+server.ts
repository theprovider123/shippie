import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { FIRST_PARTY_CURATION } from '$lib/_generated/first-party-curation';

type CatalogRow = {
  count: number;
  latest_app_update: string | null;
  latest_deploy: string | null;
};

export const GET: RequestHandler = async ({ platform }) => {
  const staticVersion = stableHash(
    FIRST_PARTY_CURATION
      .map((entry) => `${entry.slug}:${entry.visibility}:${entry.surface}:${entry.tier}:${entry.successor ?? ''}`)
      .sort()
      .join('|'),
  );

  if (!platform?.env.DB) {
    return json(
      {
        version: `static:${staticVersion}`,
        live_count: FIRST_PARTY_CURATION.filter((entry) => entry.visibility === 'public' && entry.surface !== 'archived').length,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  const row = await platform.env.DB
    .prepare(
      `SELECT COUNT(*) AS count,
              MAX(updated_at) AS latest_app_update,
              MAX(last_deployed_at) AS latest_deploy
       FROM apps
       WHERE is_archived = 0
         AND visibility_scope = 'public'`,
    )
    .first<CatalogRow>();

  const count = Number(row?.count ?? 0);
  const latestAppUpdate = row?.latest_app_update ?? '';
  const latestDeploy = row?.latest_deploy ?? '';

  return json(
    {
      version: `db:${staticVersion}:${count}:${latestAppUpdate}:${latestDeploy}`,
      live_count: count,
      updated_at: latestDeploy || latestAppUpdate || null,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
};

function stableHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}
