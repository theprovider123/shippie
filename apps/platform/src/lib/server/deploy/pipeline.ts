/**
 * Deploy pipeline orchestrator — Worker-friendly port of
 * apps/web/lib/deploy/index.ts:deployStaticHot.
 *
 * Single hot path (Phase 4b drops the cold-path autopack entirely;
 * ranking + autopack land in Phase 7 or later — they're not on the
 * happy path for "ship a zip and see it live").
 *
 * Steps:
 *   1. Extract zip (with zip-slip protection)
 *   2. Derive manifest (BaaS scanner picks up Supabase/Firebase/etc.)
 *   3. Preflight checks (slug + reserved-paths + SW + size + server-code)
 *   4. Upsert apps + deploys rows (Drizzle on D1)
 *   5. PWA + CSP injection into HTML files
 *   6. Upload files to R2 (native binding)
 *   7. Mark deploy success, flip apps.active_deploy_id, write KV
 *      (`apps:{slug}:meta`, `apps:{slug}:csp`, then `apps:{slug}:active`
 *      flip-last for atomicity from the Worker's read perspective).
 */
import { eq, and, desc } from 'drizzle-orm';
import type { D1Database, R2Bucket, KVNamespace } from '@cloudflare/workers-types';
import {
  analyseApp,
  classifyKind,
  runSecurityScan,
  runPrivacyAudit,
} from '@shippie/analyse';
import { getDrizzleClient, schema } from '../db/client';
import { extractZipSafe } from './zip-extract';
import { deriveManifest, type ShippieJsonLite } from './manifest';
import { runPreflight, type PreflightReport } from './preflight';
import { uploadFilesToR2 } from './r2-upload';
import {
  writeAppMeta,
  writeActivePointer,
  writeCspHeader,
  writeAppProfile,
  writeAppKindProfile,
} from './kv-write';
import { buildCsp } from './csp';
import { profileFromDetection, type AppKind } from '$lib/types/app-kind';
import {
  emptyReport,
  deployReportKey,
  type DeployReport,
  type DeployStep,
} from './deploy-report';
import { runHealthCheck } from './health-check';

export interface DeployStaticInput {
  slug: string;
  makerId: string;
  zipBuffer: Uint8Array;
  shippieJson?: ShippieJsonLite;
  reservedSlugs: ReadonlySet<string>;
  /** Bindings — pulled from event.platform.env in the route. */
  db: D1Database;
  r2: R2Bucket;
  kv: KVNamespace;
  /** PUBLIC_ORIGIN env var, e.g. "https://shippie.app". Drives live-URL shape. */
  publicOrigin: string;
}

export interface DeployStaticResult {
  success: boolean;
  version: number;
  files: number;
  totalBytes: number;
  preflight: PreflightReport;
  liveUrl: string;
  reason?: string;
  appId?: string;
  deployId?: string;
  notes?: string[];
}

export async function deployStatic(input: DeployStaticInput): Promise<DeployStaticResult> {
  const startedAt = Date.now();

  // 1. Extract
  const extracted = extractZipSafe(input.zipBuffer);
  if (!extracted.ok) {
    return failReport(input.slug, extracted.reason);
  }
  const files = extracted.files;
  const initialTotalBytes = extracted.totalBytes;

  // 2. Manifest
  const manifestResult = deriveManifest({
    slug: input.slug,
    shippieJson: input.shippieJson,
    files,
  });
  if (manifestResult.error) {
    return failReport(input.slug, `Invalid shippie.json: ${manifestResult.error}`);
  }
  const manifest = manifestResult.manifest;

  // 3. Preflight
  const preflight = runPreflight({
    slug: input.slug,
    manifest: { type: manifest.type, name: manifest.name },
    files,
    totalBytes: initialTotalBytes,
    reservedSlugs: input.reservedSlugs,
  });

  if (!preflight.passed) {
    return {
      success: false,
      version: 0,
      files: files.size,
      totalBytes: initialTotalBytes,
      preflight,
      liveUrl: '',
      reason: preflight.blockers.map((b) => b.title).join(' · '),
    };
  }

  const db = getDrizzleClient(input.db);

  // 4. Upsert apps row
  let appRow = await db.query.apps.findFirst({
    where: eq(schema.apps.slug, input.slug),
  });

  if (!appRow) {
    const [inserted] = await db
      .insert(schema.apps)
      .values({
        slug: input.slug,
        name: manifest.name,
        tagline: manifest.tagline ?? null,
        description: manifest.description ?? null,
        type: manifest.type,
        category: manifest.category,
        themeColor: manifest.theme_color ?? '#14120F',
        backgroundColor: manifest.background_color ?? '#ffffff',
        sourceType: 'zip',
        makerId: input.makerId,
      })
      .returning();
    if (!inserted) return failReport(input.slug, 'Failed to create app row');
    appRow = inserted;
  } else if (appRow.makerId !== input.makerId) {
    return failReport(input.slug, `Slug '${input.slug}' is already claimed by another maker.`);
  }

  // Determine next version
  const latest = await db
    .select({ version: schema.deploys.version })
    .from(schema.deploys)
    .where(eq(schema.deploys.appId, appRow.id))
    .orderBy(desc(schema.deploys.version))
    .limit(1);
  const version = (latest[0]?.version ?? 0) + 1;

  // 5. Insert deploys row in 'building' state
  const [deployRow] = await db
    .insert(schema.deploys)
    .values({
      appId: appRow.id,
      version,
      sourceType: 'zip',
      status: 'building',
      shippieJson: manifest as unknown as Record<string, unknown>,
      createdBy: input.makerId,
    })
    .returning();
  if (!deployRow) return failReport(input.slug, 'Failed to create deploy row');

  // 6. CSP + PWA injection
  const csp = buildCsp(manifest);
  injectIntoHtmlFiles(files, csp.metaTag, manifest, version);

  // 7. Upload to R2
  let upload: Awaited<ReturnType<typeof uploadFilesToR2>>;
  try {
    upload = await uploadFilesToR2(input.r2, input.slug, version, files);
  } catch (err) {
    await db
      .update(schema.deploys)
      .set({ status: 'failed', completedAt: new Date().toISOString(), errorMessage: (err as Error).message })
      .where(eq(schema.deploys.id, deployRow.id));
    return failReport(input.slug, `r2_upload_failed: ${(err as Error).message}`);
  }

  // 8. Insert deploy_artifacts + mark deploy success + flip active
  await db.insert(schema.deployArtifacts).values({
    deployId: deployRow.id,
    r2Prefix: `apps/${input.slug}/v${version}`,
    fileCount: files.size,
    totalBytes: upload.totalBytes,
    manifest: { files: upload.manifest } as unknown as Record<string, unknown>,
  });

  const completedAt = new Date().toISOString();
  await db
    .update(schema.deploys)
    .set({
      status: 'success',
      completedAt,
      durationMs: Date.now() - startedAt,
      preflightStatus: 'passed',
      preflightReport: preflight as unknown as Record<string, unknown>,
      cspHeader: csp.header,
    })
    .where(eq(schema.deploys.id, deployRow.id));

  await db
    .update(schema.apps)
    .set({
      activeDeployId: deployRow.id,
      latestDeployId: deployRow.id,
      latestDeployStatus: 'success',
      lastDeployedAt: completedAt,
      firstPublishedAt: appRow.firstPublishedAt ?? completedAt,
      updatedAt: completedAt,
    })
    .where(eq(schema.apps.id, appRow.id));

  // Upsert app_permissions
  const permValues = {
    auth: manifest.permissions?.auth ?? false,
    storage: manifest.permissions?.storage ?? 'none',
    files: manifest.permissions?.files ?? false,
    notifications: manifest.permissions?.notifications ?? false,
    analytics: manifest.permissions?.analytics ?? true,
    externalNetwork: manifest.permissions?.external_network ?? false,
    allowedConnectDomains: manifest.allowed_connect_domains ?? [],
    updatedAt: completedAt,
  };
  await db
    .insert(schema.appPermissions)
    .values({ appId: appRow.id, ...permValues })
    .onConflictDoUpdate({
      target: [schema.appPermissions.appId],
      set: permValues,
    });

  // 9. KV writes — meta + csp first, active LAST so the Worker's read of
  // `active` always finds coherent meta + csp for that version.
  await writeAppMeta(input.kv, input.slug, {
    slug: input.slug,
    name: manifest.name,
    type: manifest.type,
    theme_color: manifest.theme_color ?? '#E8603C',
    background_color: manifest.background_color ?? '#ffffff',
    version,
    visibility_scope: appRow.visibilityScope,
    permissions: manifest.permissions ?? {
      auth: false,
      storage: 'none',
      files: false,
      notifications: false,
      analytics: true,
    },
  });
  await writeCspHeader(input.kv, input.slug, csp.header);

  // Deploy-time AppProfile from @shippie/analyse. Stored under
  // `apps:{slug}:profile` for the maker dashboard's Enhancements tab + the
  // PWA manifest's smart defaults. Failure here is non-blocking — the
  // analyse step is purely informational and a corrupt profile shouldn't
  // block a successful deploy.
  try {
    const profile = await analyseApp({ files });
    await writeAppProfile(input.kv, input.slug, profile);
  } catch (err) {
    console.error('[shippie:deploy] analyseApp failed', err);
  }

  // App Kinds classification (docs/app-kinds.md). Same non-blocking
  // pattern as the AppProfile call above — a corrupt or empty profile
  // shouldn't take down a deploy. Persists per-deploy in `deploys` and
  // denormalizes onto `apps` for fast marketplace queries; KV mirror
  // for the wrapper.
  let kindProfileForReport: ReturnType<typeof profileFromDetection> | null = null;
  try {
    const detection = classifyKind(files);
    const declared = (input.shippieJson?.kind as AppKind | undefined) ?? undefined;
    const kindProfile = profileFromDetection(detection, declared);
    kindProfileForReport = kindProfile;

    await writeAppKindProfile(input.kv, input.slug, kindProfile);
    await db
      .update(schema.deploys)
      .set({ kindProfileJson: kindProfile as unknown as Record<string, unknown> })
      .where(eq(schema.deploys.id, deployRow.id));
    await db
      .update(schema.apps)
      .set({
        currentDetectedKind: kindProfile.detectedKind,
        currentPublicKindStatus: kindProfile.publicKindStatus,
      })
      .where(eq(schema.apps.id, appRow.id));
  } catch (err) {
    console.error('[shippie:deploy] classifyKind failed', err);
  }

  // Phase 2 Deploy Truth — security scan + privacy audit + deploy report
  // artifact. All non-blocking: the scoring + gating happens in Phase 4.
  // Today this is maker-facing only; users see the kind badge and that's it.
  try {
    await writeDeployReport({
      r2: input.r2,
      slug: input.slug,
      version,
      files,
      kindProfile: kindProfileForReport,
      manifest,
      durationMs: Date.now() - startedAt,
      totalBytes: upload.totalBytes,
      preflight,
    });
  } catch (err) {
    console.error('[shippie:deploy] writeDeployReport failed', err);
  }

  await writeActivePointer(input.kv, input.slug, version);

  return {
    success: true,
    version,
    files: files.size,
    totalBytes: upload.totalBytes,
    preflight,
    liveUrl: resolveLiveUrl(input.publicOrigin, input.slug),
    appId: appRow.id,
    deployId: deployRow.id,
    notes: manifestResult.notes.length > 0 ? manifestResult.notes : undefined,
  };
}

function failReport(slug: string, reason: string): DeployStaticResult {
  return {
    success: false,
    version: 0,
    files: 0,
    totalBytes: 0,
    preflight: {
      passed: false,
      findings: [],
      warnings: [],
      blockers: [{ rule: 'zip-extraction', severity: 'block', title: reason }],
      durationMs: 0,
    },
    liveUrl: '',
    reason,
  };
}

/**
 * Resolve the public live URL for a slug. Examples:
 *   publicOrigin = "https://shippie.app"        → "https://chiwit.shippie.app/"
 *   publicOrigin = "https://next.shippie.app"   → "https://chiwit.next.shippie.app/"
 *   publicOrigin = "http://localhost:5173"      → "http://chiwit.localhost:5173/"
 */
export function resolveLiveUrl(publicOrigin: string, slug: string): string {
  try {
    const u = new URL(publicOrigin);
    const portSuffix = u.port ? `:${u.port}` : '';
    return `${u.protocol}//${slug}.${u.hostname}${portSuffix}/`;
  } catch {
    return `https://${slug}.shippie.app/`;
  }
}

/**
 * Lightweight HTML injection — adds the CSP meta tag, missing essentials
 * (viewport, charset, lang), Open Graph tags derived from the manifest,
 * and a stable favicon hint to every HTML file's <head>.
 *
 * Phase 2.4 of the master plan. Each piece is independent and idempotent:
 * if the maker already declared the tag we leave theirs alone.
 *
 * The PWA manifest <link> + Shippie SDK <script> are still injected at
 * runtime by the wrapper HTMLRewriter (see lib/server/wrapper/). That
 * keeps version bumps cheap — we don't rewrite those at build time.
 */
function injectIntoHtmlFiles(
  files: Map<string, Uint8Array>,
  cspMetaTag: string,
  manifest: ShippieJsonLite,
  _version: number,
): void {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  for (const [path, body] of files) {
    if (!path.endsWith('.html') && !path.endsWith('.htm')) continue;
    const original = decoder.decode(body);
    const updated = injectEssentials(original, cspMetaTag, manifest);
    if (updated !== original) {
      files.set(path, encoder.encode(updated));
    }
  }
}

/**
 * Apply the essential-tags injection. Pure function so we can unit-test.
 * Returns the original string unchanged when there's nothing to add.
 */
export function injectEssentials(
  html: string,
  cspMetaTag: string,
  manifest: ShippieJsonLite,
): string {
  let out = html;

  // 1. CSP — always inject (overrides any maker-supplied lax CSP).
  out = out.replace(/<head([^>]*)>/i, `<head$1>${cspMetaTag}\n`);

  // 2. Charset — inject if missing.
  if (!/<meta\s+[^>]*charset\s*=/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1>\n  <meta charset="utf-8">`);
  }

  // 3. Viewport — inject if missing. Without this, mobile renders desktop-zoom.
  if (!/<meta\s+[^>]*name\s*=\s*["']viewport["']/i.test(out)) {
    out = out.replace(
      /<head([^>]*)>/i,
      `<head$1>\n  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`,
    );
  }

  // 4. lang on <html> — only set if absent. Best-effort 'en' default.
  out = out.replace(/<html(?![^>]*\blang\s*=)([^>]*)>/i, '<html$1 lang="en">');

  // 5. Open Graph tags — only inject if NONE are present (so we don't
  //    fight a maker who set up their own social card).
  if (!/<meta\s+[^>]*property\s*=\s*["']og:/i.test(out)) {
    const ogTags = buildOpenGraphTags(manifest);
    if (ogTags) {
      out = out.replace(/<head([^>]*)>/i, `<head$1>${ogTags}`);
    }
  }

  // 6. theme-color — inject if missing. Drives Android Chrome's address-bar tint.
  if (!/<meta\s+[^>]*name\s*=\s*["']theme-color["']/i.test(out) && manifest.theme_color) {
    out = out.replace(
      /<head([^>]*)>/i,
      `<head$1>\n  <meta name="theme-color" content="${escapeAttr(manifest.theme_color)}">`,
    );
  }

  return out;
}

function buildOpenGraphTags(manifest: ShippieJsonLite): string {
  const title = manifest.name ?? '';
  const description = manifest.description ?? manifest.tagline ?? '';
  const lines: string[] = [];
  if (title) {
    lines.push(`  <meta property="og:title" content="${escapeAttr(title)}">`);
    lines.push(`  <meta name="twitter:title" content="${escapeAttr(title)}">`);
  }
  if (description) {
    lines.push(`  <meta property="og:description" content="${escapeAttr(description)}">`);
    lines.push(`  <meta name="twitter:description" content="${escapeAttr(description)}">`);
    lines.push(`  <meta name="description" content="${escapeAttr(description)}">`);
  }
  lines.push('  <meta property="og:type" content="website">');
  lines.push('  <meta name="twitter:card" content="summary">');
  if (lines.length === 0) return '';
  return '\n' + lines.join('\n');
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Build the Phase 2 deploy report and persist it to R2.
 *
 * Order of work mirrors the existing pipeline so each step's status
 * reflects what actually happened in this deploy. Pure function aside
 * from the final R2 write — easy to unit-test if we factor it later.
 */
interface WriteDeployReportInput {
  r2: R2Bucket;
  slug: string;
  version: number;
  files: Map<string, Uint8Array>;
  kindProfile: ReturnType<typeof profileFromDetection> | null;
  manifest: ShippieJsonLite;
  durationMs: number;
  totalBytes: number;
  preflight: PreflightReport;
}

async function writeDeployReport(input: WriteDeployReportInput): Promise<void> {
  const report: DeployReport = emptyReport(input.slug, input.version);
  report.durationMs = input.durationMs;
  report.files = input.files.size;
  report.totalBytes = input.totalBytes;

  const steps: DeployStep[] = [];
  steps.push({
    id: 'extract',
    title: 'Extract bundle',
    status: 'ok',
    finishedAtMs: 0,
  });
  steps.push({
    id: 'preflight',
    title: 'Preflight checks',
    status: input.preflight.passed ? 'ok' : 'block',
    finishedAtMs: input.preflight.durationMs,
    notes: input.preflight.warnings.map((w) => w.title),
  });

  // Security scan.
  let securityReport;
  try {
    securityReport = runSecurityScan(input.files, null);
    report.security = {
      findings: securityReport.findings,
      blocks: securityReport.blocks,
      warns: securityReport.warns,
      infos: securityReport.infos,
      scannedFiles: securityReport.scannedFiles,
    };
    steps.push({
      id: 'security_scan',
      title: 'Security scan',
      status:
        securityReport.blocks > 0
          ? 'block'
          : securityReport.warns > 0
            ? 'warn'
            : 'ok',
      finishedAtMs: input.durationMs,
      notes:
        securityReport.findings.length > 0
          ? [
              `${securityReport.blocks} block · ${securityReport.warns} warn · ${securityReport.infos} info`,
            ]
          : undefined,
    });
  } catch (err) {
    steps.push({
      id: 'security_scan',
      title: 'Security scan',
      status: 'skipped',
      finishedAtMs: input.durationMs,
      notes: [(err as Error).message],
    });
  }

  // Privacy audit.
  try {
    const privacyReport = runPrivacyAudit(input.files, {
      allowedFeatureDomains: input.manifest.allowed_connect_domains ?? [],
    });
    report.privacy = privacyReport;
    steps.push({
      id: 'privacy_audit',
      title: 'Privacy audit',
      status:
        privacyReport.counts.tracker > 0
          ? 'warn'
          : privacyReport.counts.unknown > 0
            ? 'warn'
            : 'ok',
      finishedAtMs: input.durationMs,
      notes:
        privacyReport.domains.length > 0
          ? [
              `${privacyReport.counts.tracker} tracker · ` +
                `${privacyReport.counts.feature} feature · ` +
                `${privacyReport.counts.cdn} cdn · ` +
                `${privacyReport.counts.unknown} unknown`,
            ]
          : undefined,
    });
  } catch (err) {
    steps.push({
      id: 'privacy_audit',
      title: 'Privacy audit',
      status: 'skipped',
      finishedAtMs: input.durationMs,
      notes: [(err as Error).message],
    });
  }

  // Kind classification — already ran upstream; reflect into the report.
  if (input.kindProfile) {
    report.kind = {
      detected: input.kindProfile.detectedKind,
      declared: input.kindProfile.declaredKind,
      public: input.kindProfile.publicKind,
      publicStatus: input.kindProfile.publicKindStatus,
      confidence: input.kindProfile.confidence,
      reasons: input.kindProfile.reasons,
    };
    steps.push({
      id: 'kind_classified',
      title: `Classified as ${input.kindProfile.publicKind}`,
      status: 'ok',
      finishedAtMs: input.durationMs,
    });
  } else {
    steps.push({
      id: 'kind_classified',
      title: 'Kind classification',
      status: 'skipped',
      finishedAtMs: input.durationMs,
    });
  }

  steps.push({
    id: 'upload',
    title: 'Upload to R2',
    status: 'ok',
    finishedAtMs: input.durationMs,
    notes: [`${input.files.size} files · ${input.totalBytes} bytes`],
  });

  // Health check — runs in critical path; lightweight (manifest/SW/asset
  // resolution + installability hints). Full Lighthouse is async per the
  // master plan and not done here.
  try {
    const health = runHealthCheck(input.files);
    const failed = health.items.filter((i) => i.severity === 'fail').length;
    const warned = health.items.filter((i) => i.severity === 'warn').length;
    steps.push({
      id: 'health_check',
      title: 'Health check',
      status: failed > 0 ? 'block' : warned > 0 ? 'warn' : 'ok',
      finishedAtMs: input.durationMs,
      notes: [
        `${health.items.length} checks · ${warned} warn · ${failed} fail`,
        ...health.items
          .filter((i) => i.severity !== 'ok')
          .slice(0, 4)
          .map((i) => `${i.severity}: ${i.title}`),
      ],
    });
  } catch (err) {
    steps.push({
      id: 'health_check',
      title: 'Health check',
      status: 'skipped',
      finishedAtMs: input.durationMs,
      notes: [(err as Error).message],
    });
  }

  steps.push({
    id: 'deploy_live',
    title: 'Deploy live',
    status: 'ok',
    finishedAtMs: input.durationMs,
  });

  report.steps = steps;
  report.generatedAt = new Date().toISOString();

  await input.r2.put(deployReportKey(input.slug, input.version), JSON.stringify(report), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });
}
