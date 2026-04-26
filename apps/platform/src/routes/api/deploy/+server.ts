/**
 * POST /api/deploy
 *
 * Zip upload deploy. Accepts multipart/form-data with `slug` + `zip` fields.
 * Contract preserved from apps/web/app/api/deploy/route.ts so the existing
 * CLI + MCP keep working.
 *
 * Response shape:
 *   { success, slug, version, deploy_id, files, total_bytes, live_url, preflight }
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$server/auth/resolve-user';
import { deployStatic } from '$server/deploy/pipeline';
import { loadReservedSlugs } from '$server/deploy/reserved-slugs';

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB || !env?.APPS || !env?.CACHE) {
    throw error(500, 'platform bindings unavailable');
  }

  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthenticated' }, { status: 401 });

  let form: FormData;
  try {
    form = await event.request.formData();
  } catch {
    return json({ error: 'invalid_form' }, { status: 400 });
  }

  const slug = String(form.get('slug') ?? '').trim();
  const zip = form.get('zip');

  if (!slug) return json({ error: 'missing slug' }, { status: 400 });
  if (!(zip instanceof File)) {
    return json({ error: 'missing zip file' }, { status: 400 });
  }

  const arrayBuffer = await zip.arrayBuffer();
  const zipBuffer = new Uint8Array(arrayBuffer);

  const reservedSlugs = await loadReservedSlugs(env.DB);

  try {
    const result = await deployStatic({
      slug,
      makerId: who.userId,
      zipBuffer,
      reservedSlugs,
      db: env.DB,
      r2: env.APPS,
      kv: env.CACHE,
      publicOrigin: env.PUBLIC_ORIGIN ?? 'https://shippie.app',
    });

    if (!result.success) {
      return json(
        {
          error: 'preflight_failed',
          reason: result.reason,
          preflight: result.preflight,
        },
        { status: 400 },
      );
    }

    return json({
      success: true,
      slug,
      version: result.version,
      deploy_id: result.deployId,
      files: result.files,
      total_bytes: result.totalBytes,
      live_url: result.liveUrl,
      preflight: {
        passed: true,
        warnings: result.preflight.warnings.map((w) => ({ rule: w.rule, title: w.title })),
        duration_ms: result.preflight.durationMs,
      },
    });
  } catch (err) {
    console.error('[shippie:deploy] error', err);
    return json(
      {
        error: 'deploy_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
};
