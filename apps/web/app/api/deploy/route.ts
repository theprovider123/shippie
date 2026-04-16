/**
 * POST /api/deploy
 *
 * Zip upload → preflight → PWA injection → R2 → KV pointer flip.
 *
 * For now this is the only deploy entry. GitHub App repo clones +
 * Vercel Sandbox builds land in Week 6.
 *
 * Request: multipart/form-data with fields:
 *   slug    (string, required)
 *   zip     (File, required — the built-output zip)
 *
 * Spec v6 §10.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { after } from 'next/server';
import { resolveUserId } from '@/lib/cli-auth';
import { deployStaticHot, deployCold } from '@/lib/deploy';
import { loadReservedSlugs } from '@/lib/deploy/reserved-slugs.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const who = await resolveUserId(req);
  if (!who) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const form = await req.formData();
  const slug = String(form.get('slug') ?? '').trim();
  const zip = form.get('zip');

  if (!slug) {
    return NextResponse.json({ error: 'missing slug' }, { status: 400 });
  }
  if (!(zip instanceof File)) {
    return NextResponse.json({ error: 'missing zip file' }, { status: 400 });
  }

  const arrayBuffer = await zip.arrayBuffer();
  const zipBuffer = Buffer.from(arrayBuffer);

  const reservedSlugs = await loadReservedSlugs();

  try {
    const result = await deployStaticHot({
      slug,
      makerId: who.userId,
      zipBuffer,
      reservedSlugs,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'preflight_failed',
          reason: result.reason,
          preflight: result.preflight,
        },
        { status: 400 },
      );
    }

    if (result.appId && result.deployId && result.filesForCold && result.manifestForCold) {
      const { appId, deployId, filesForCold, manifestForCold } = result;
      after(() =>
        deployCold({
          appId,
          deployId,
          slug,
          version: result.version,
          files: filesForCold,
          manifest: manifestForCold,
        }),
      );
    }

    return NextResponse.json({
      success: true,
      slug,
      version: result.version,
      deploy_id: result.deployId,
      files: result.files,
      total_bytes: result.totalBytes,
      live_url: result.liveUrl,
      preflight: {
        passed: true,
        warnings: result.preflight.warnings.map((w) => ({
          rule: w.rule,
          title: w.title,
        })),
        remediations: result.preflight.remediations.map((r) => ({
          kind: r.remediation?.kind,
          summary: r.remediation?.summary,
        })),
        duration_ms: result.preflight.durationMs,
      },
    });
  } catch (err) {
    console.error('[shippie:deploy] error', err);
    return NextResponse.json(
      {
        error: 'deploy_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
