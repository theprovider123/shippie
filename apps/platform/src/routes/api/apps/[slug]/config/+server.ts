/**
 * GET/PATCH/DELETE /api/apps/[slug]/config
 *
 * CLI/MCP surface for the same maker shippie.json override edited in the
 * dashboard. The override is portable configuration: it is applied on the
 * next deploy and can later target a Hub with the same toolchain command.
 */
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';
import type { RequestHandler } from './$types';
import { authenticateBearer } from '$server/auth/cli-auth';
import { getDrizzleClient, schema } from '$server/db/client';
import {
  clearShippieJsonOverride,
  readShippieJsonOverride,
  writeShippieJsonOverride,
} from '$server/deploy/kv-write';
import { validateShippieJsonOverride } from '$server/deploy/shippie-json-validation';

export const GET: RequestHandler = async ({ request, platform, params }) => {
  const env = platform?.env;
  if (!env?.DB || !env?.CACHE) {
    return json({ error: 'platform_bindings_unavailable' }, { status: 500 });
  }

  const auth = await authenticateBearer(request.headers.get('authorization'), env.DB);
  if (!auth) return json({ error: 'unauthenticated' }, { status: 401 });

  const app = await requireMakerApp(env.DB, auth.userId, params.slug);
  if (!app) return json({ error: 'not_found' }, { status: 404 });

  const config = await readShippieJsonOverride(env.CACHE, params.slug);
  return json({
    slug: params.slug,
    config: config ?? {},
    has_override: Boolean(config),
  });
};

export const PATCH: RequestHandler = async ({ request, platform, params }) => {
  const env = platform?.env;
  if (!env?.DB || !env?.CACHE) {
    return json({ error: 'platform_bindings_unavailable' }, { status: 500 });
  }

  const auth = await authenticateBearer(request.headers.get('authorization'), env.DB);
  if (!auth) return json({ error: 'unauthenticated' }, { status: 401 });

  const app = await requireMakerApp(env.DB, auth.userId, params.slug);
  if (!app) return json({ error: 'not_found' }, { status: 404 });

  const body = await request.json().catch(() => null);
  const config = isRecord(body) && 'config' in body ? body.config : body;
  const validated = validateShippieJsonOverride(config);
  if (!validated.ok) {
    return json({ error: 'invalid_config', message: validated.error }, { status: 400 });
  }

  await writeShippieJsonOverride(env.CACHE, params.slug, validated.value);
  return json({
    slug: params.slug,
    config: validated.value,
    has_override: true,
  });
};

export const DELETE: RequestHandler = async ({ request, platform, params }) => {
  const env = platform?.env;
  if (!env?.DB || !env?.CACHE) {
    return json({ error: 'platform_bindings_unavailable' }, { status: 500 });
  }

  const auth = await authenticateBearer(request.headers.get('authorization'), env.DB);
  if (!auth) return json({ error: 'unauthenticated' }, { status: 401 });

  const app = await requireMakerApp(env.DB, auth.userId, params.slug);
  if (!app) return json({ error: 'not_found' }, { status: 404 });

  await clearShippieJsonOverride(env.CACHE, params.slug);
  return json({
    slug: params.slug,
    config: {},
    has_override: false,
  });
};

async function requireMakerApp(
  dbBinding: D1Database,
  userId: string,
  slug: string,
): Promise<{ id: string } | null> {
  const db = getDrizzleClient(dbBinding);
  const [app] = await db
    .select({ id: schema.apps.id, makerId: schema.apps.makerId })
    .from(schema.apps)
    .where(eq(schema.apps.slug, slug))
    .limit(1);

  if (!app || app.makerId !== userId) return null;
  return { id: app.id };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
