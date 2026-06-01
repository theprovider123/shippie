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
import { and, eq, or } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { resolveRequestUserId } from '$server/auth/resolve-user';
import { deployStatic } from '$server/deploy/pipeline';
import { loadReservedSlugs } from '$server/deploy/reserved-slugs';
import { checkRateLimit } from '$server/wrapper/rate-limit';
import { getDrizzleClient, schema } from '$server/db/client';
import { remixEligibilityForSlug } from '$server/remix/eligibility';
import { VALID_SURFACES, type Surface } from '$lib/curation/schema';

const VISIBILITY_SCOPES = ['public', 'unlisted', 'private', 'team'] as const;
type DeployVisibilityScope = (typeof VISIBILITY_SCOPES)[number];
const TEAM_DEPLOY_ROLES = new Set(['admin', 'deployer']);
const SURFACE_SET = new Set<string>(VALID_SURFACES);

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB || !env?.APPS || !env?.CACHE) {
    throw error(500, 'platform bindings unavailable');
  }

  const who = await resolveRequestUserId(event);
  if (!who) return json({ error: 'unauthenticated' }, { status: 401 });

  // Per-maker deploy rate limit. Bypasses the wrapper's per-IP limit so a
  // bad actor on a fresh IP can't burst-publish. 10 deploys / rolling 24h
  // for claimed makers; trial (anonymous) deploys go through /api/deploy/
  // trial which has its own per-IP throttle.
  const deployRate = checkRateLimit({
    key: `deploy:maker:${who}`,
    limit: 10,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!deployRate.ok) {
    return json(
      {
        error: 'rate_limited',
        reason: 'You\'ve hit the 10-deploys-per-24h limit. Try again later.',
        retry_after_ms: deployRate.retryAfterMs,
      },
      {
        status: 429,
        headers: { 'retry-after': String(Math.ceil(deployRate.retryAfterMs / 1000)) },
      },
    );
  }

  let form: FormData;
  try {
    form = await event.request.formData();
  } catch {
    return json({ error: 'invalid_form' }, { status: 400 });
  }

  const slug = String(form.get('slug') ?? '').trim();
  const zip = form.get('zip');
  const remixFrom = String(form.get('remix_from') ?? '').trim();
  const visibility = parseVisibilityScope(form.get('visibility') ?? form.get('visibility_scope'));
  const organization = String(form.get('organization') ?? form.get('organization_id') ?? '').trim();
  // Optional `surface` form field — only present when the upload form
  // picker chose something other than "Auto" (or a CLI client opted
  // in). Loses to the manifest's `curation.surface` at the resolver;
  // wins over the existing D1 row's surface when set.
  const surfaceRaw = form.get('surface');
  let surfaceOverride: Surface | undefined;
  if (typeof surfaceRaw === 'string' && surfaceRaw.length > 0) {
    if (!SURFACE_SET.has(surfaceRaw)) {
      return json({ error: 'invalid_surface', allowed: VALID_SURFACES }, { status: 400 });
    }
    surfaceOverride = surfaceRaw as Surface;
  }

  if (!slug) return json({ error: 'missing slug' }, { status: 400 });
  if (!(zip instanceof File)) {
    return json({ error: 'missing zip file' }, { status: 400 });
  }
  if (remixFrom && remixFrom === slug) {
    return json(
      { error: 'self_remix_not_allowed', reason: 'An app cannot be deployed as a remix of itself.' },
      { status: 400 },
    );
  }
  if (visibility === 'invalid') {
    return json({ error: 'invalid_visibility_scope' }, { status: 400 });
  }

  const arrayBuffer = await zip.arrayBuffer();
  const zipBuffer = new Uint8Array(arrayBuffer);

  const reservedSlugs = await loadReservedSlugs(env.DB);
  const db = getDrizzleClient(env.DB);
  const organizationId =
    visibility === 'team'
      ? await resolveDeployOrganization(db, who.userId, organization)
      : undefined;
  if (visibility === 'team' && !organizationId) {
    return json({ error: 'invalid_or_forbidden_organization' }, { status: 403 });
  }
  const remix = remixFrom
    ? await remixEligibilityForSlug(db, remixFrom)
    : null;
  if (remix?.ok === false) {
    return json({ error: 'remix_unavailable', reason: remix.reason }, { status: 400 });
  }
  const remixApp = remix?.ok ? remix.app : null;

  try {
    const result = await deployStatic({
      slug,
      makerId: who.userId,
      zipBuffer,
      visibilityScope: visibility,
      organizationId,
      surfaceOverride,
      lineage: remixApp
        ? {
            templateId: remixApp.templateId ?? undefined,
            parentAppId: remixApp.id,
            parentVersion: remixApp.latestVersion,
            license: remixApp.license,
            // Remix-depth policy: a child of a remix is NOT itself remixable by
            // default (closed). This is a deliberate choice, not an accident —
            // the maker re-opens remixing explicitly from the app profile, which
            // requires publishing source + license first. Keeps clone chains
            // opt-in instead of propagating automatically.
            remixAllowed: false,
          }
        : undefined,
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

    if (!result.deployId) {
      return json({ error: 'deploy_failed', message: 'missing_deploy_id' }, { status: 500 });
    }

    return json({
      success: true,
      slug,
      version: result.version,
      deploy_id: result.deployId,
      files: result.files,
      total_bytes: result.totalBytes,
      live_url: result.liveUrl,
      visibility_scope: result.visibilityScope,
      report_url: `/dashboard/apps/${encodeURIComponent(slug)}/deploys/${encodeURIComponent(result.deployId)}`,
      report_json_url: `/api/deploy/${encodeURIComponent(result.deployId)}/report`,
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

async function resolveDeployOrganization(
  db: ReturnType<typeof getDrizzleClient>,
  userId: string,
  organization: string,
): Promise<string | null> {
  if (!organization) return null;
  const [org] = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(
      or(
        eq(schema.organizations.id, organization),
        eq(schema.organizations.slug, organization),
      ),
    )
    .limit(1);
  if (!org) return null;

  const [membership] = await db
    .select({ role: schema.organizationMembers.role })
    .from(schema.organizationMembers)
    .where(
      and(
        eq(schema.organizationMembers.orgId, org.id),
        eq(schema.organizationMembers.userId, userId),
      ),
    )
    .limit(1);
  return membership && TEAM_DEPLOY_ROLES.has(membership.role) ? org.id : null;
}

function parseVisibilityScope(value: FormDataEntryValue | null): DeployVisibilityScope | undefined | 'invalid' {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string') return 'invalid';
  return (VISIBILITY_SCOPES as readonly string[]).includes(value)
    ? (value as DeployVisibilityScope)
    : 'invalid';
}
