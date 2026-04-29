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
  computeSecurityScore,
  computePrivacyGrade,
  localize,
  type LocalizeTransform,
} from '@shippie/analyse';
import { buildShippiePackage, createShippiePackageArchive } from '@shippie/app-package-builder';
import {
  SHIPPIE_PERMISSIONS_SCHEMA,
  type ContainerEligibility,
  type AppPermissions,
  type SourceMetadata,
  type TrustReport,
} from '@shippie/app-package-contract';
import { getDrizzleClient, schema } from '../db/client';
import { extractZipSafe } from './zip-extract';
import { normalizeDeployOutput } from './output-normalize';
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
  packageArtifactKey,
  packageArtifactPrefix,
  type DeployReport,
  type DeployStep,
} from './deploy-report';
import { runHealthCheck } from './health-check';
import {
  createEventEmitter,
  serializeEventsNdjson,
  deployEventsKey,
  type DeployEventEmitter,
} from './deploy-events';

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
  const emitter = createEventEmitter(startedAt);

  // 1. Extract
  const extracted = extractZipSafe(input.zipBuffer);
  if (!extracted.ok) {
    emitter.emit({ type: 'deploy_failed', reason: extracted.reason, step: 'extract' });
    return failReport(input.slug, extracted.reason);
  }
  let files = extracted.files;
  let totalBytes = extracted.totalBytes;
  emitter.emit({
    type: 'deploy_received',
    slug: input.slug,
    version: 0, // not yet known; updated below
    files: files.size,
    bytes: totalBytes,
  });

  // 1b. Normalize framework output folders (`dist`, `out`, `build`, ...)
  // to the runtime root. Without this, a normal Vite/Next/Svelte export can
  // pass preflight but fail live because `/` cannot find root index.html.
  const normalized = normalizeDeployOutput(files);
  files = normalized.files;
  totalBytes = normalized.totalBytes;
  if (normalized.indexPath) {
    emitter.emit({
      type: 'framework_detected',
      framework: normalized.framework,
      indexPath: normalized.indexPath,
    });
  }

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
    totalBytes,
    reservedSlugs: input.reservedSlugs,
  });

  if (!preflight.passed) {
    return {
      success: false,
      version: 0,
      files: files.size,
      totalBytes,
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
  emitter.emit({
    type: 'essentials_injected',
    injected: ['csp', 'viewport', 'charset', 'lang', 'og_tags', 'theme_color'],
  });

  // 7. Upload to R2
  emitter.emit({ type: 'upload_started', files: files.size, bytes: totalBytes });
  let upload: Awaited<ReturnType<typeof uploadFilesToR2>>;
  try {
    upload = await uploadFilesToR2(input.r2, input.slug, version, files);
  } catch (err) {
    emitter.emit({
      type: 'deploy_failed',
      reason: `r2_upload_failed: ${(err as Error).message}`,
      step: 'upload',
    });
    await flushEvents(input.r2, input.slug, version, emitter);
    await db
      .update(schema.deploys)
      .set({ status: 'failed', completedAt: new Date().toISOString(), errorMessage: (err as Error).message })
      .where(eq(schema.deploys.id, deployRow.id));
    return failReport(input.slug, `r2_upload_failed: ${(err as Error).message}`);
  }
  emitter.emit({ type: 'upload_finished', files: files.size, bytes: upload.totalBytes });

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

  const lineageValues = {
    templateId: manifest.template_id ?? null,
    parentAppId: manifest.parent_app_id ?? null,
    parentVersion: manifest.parent_version ?? null,
    sourceRepo: manifest.source_repo ?? appRow.githubRepo ?? null,
    license: manifest.license ?? null,
    remixAllowed: manifest.remix_allowed ?? false,
    updatedAt: completedAt,
  };
  await db
    .insert(schema.appLineage)
    .values({ appId: appRow.id, ...lineageValues })
    .onConflictDoUpdate({
      target: [schema.appLineage.appId],
      set: lineageValues,
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
    allowed_connect_domains: manifest.allowed_connect_domains ?? [],
    workflow_probes: manifest.workflow_probes ?? [],
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
    emitter.emit({
      type: 'kind_classified',
      detected: kindProfile.detectedKind,
      declared: kindProfile.declaredKind,
      publicKind: kindProfile.publicKind,
      publicStatus: kindProfile.publicKindStatus,
      confidence: kindProfile.confidence,
      reasons: kindProfile.reasons.slice(0, 5),
    });
  } catch (err) {
    console.error('[shippie:deploy] classifyKind failed', err);
  }

  // Phase 2 Deploy Truth — security scan + privacy audit + deploy report
  // artifact. All non-blocking: the scoring + gating happens in Phase 4.
  // Today this is maker-facing only; users see the kind badge and that's it.
  try {
    await writeDeployReport({
      db,
      r2: input.r2,
      slug: input.slug,
      appId: appRow.id,
      deployId: deployRow.id,
      makerId: input.makerId,
      version,
      files,
      kindProfile: kindProfileForReport,
      manifest,
      durationMs: Date.now() - startedAt,
      totalBytes: upload.totalBytes,
      preflight,
      emitter,
    });
  } catch (err) {
    console.error('[shippie:deploy] writeDeployReport failed', err);
  }

  await writeActivePointer(input.kv, input.slug, version);

  const liveUrl = resolveLiveUrl(input.publicOrigin, input.slug);
  emitter.emit({
    type: 'deploy_live',
    liveUrl,
    durationMs: Date.now() - startedAt,
  });

  // Flush events to R2 last so the artifact reflects the final state.
  // Non-blocking: a failed flush should never break the deploy itself.
  await flushEvents(input.r2, input.slug, version, emitter);

  return {
    success: true,
    version,
    files: files.size,
    totalBytes: upload.totalBytes,
    preflight,
    liveUrl,
    appId: appRow.id,
    deployId: deployRow.id,
    notes: manifestResult.notes.length > 0 ? manifestResult.notes : undefined,
  };
}

async function flushEvents(
  r2: R2Bucket,
  slug: string,
  version: number,
  emitter: DeployEventEmitter,
): Promise<void> {
  try {
    const ndjson = serializeEventsNdjson(emitter.events());
    await r2.put(deployEventsKey(slug, version), ndjson, {
      httpMetadata: { contentType: 'application/x-ndjson; charset=utf-8' },
    });
  } catch (err) {
    console.error('[shippie:deploy] flushEvents failed', err);
  }
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
  db: ReturnType<typeof getDrizzleClient>;
  r2: R2Bucket;
  slug: string;
  appId: string;
  deployId: string;
  makerId: string;
  version: number;
  files: Map<string, Uint8Array>;
  kindProfile: ReturnType<typeof profileFromDetection> | null;
  manifest: ShippieJsonLite;
  durationMs: number;
  totalBytes: number;
  preflight: PreflightReport;
  emitter: DeployEventEmitter;
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
    input.emitter.emit({
      type: 'security_scan_started',
      filesToScan: input.files.size,
    });
    securityReport = runSecurityScan(input.files, null);
    // Emit one event per finding so dashboard / stream consumers can
    // render incrementally. Capped to first 50 to keep the artifact
    // sane on pathological bundles.
    for (const finding of securityReport.findings.slice(0, 50)) {
      input.emitter.emit({
        type: 'secret_detected',
        rule: finding.rule,
        severity: finding.severity,
        location: finding.location,
        redacted: finding.snippet ?? '',
        reason: finding.reason,
      });
    }
    input.emitter.emit({
      type: 'security_scan_finished',
      blocks: securityReport.blocks,
      warns: securityReport.warns,
      infos: securityReport.infos,
    });
    report.security = {
      findings: securityReport.findings,
      blocks: securityReport.blocks,
      warns: securityReport.warns,
      infos: securityReport.infos,
      scannedFiles: securityReport.scannedFiles,
      // Phase 4 Stage A — computed but maker-facing only.
      score: computeSecurityScore(securityReport),
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
    report.privacy = {
      ...privacyReport,
      // Phase 4 Stage A — computed but maker-facing only.
      grade: computePrivacyGrade(privacyReport),
    };
    input.emitter.emit({
      type: 'privacy_audit_finished',
      trackers: privacyReport.counts.tracker,
      unknown: privacyReport.counts.unknown,
      feature: privacyReport.counts.feature,
      cdn: privacyReport.counts.cdn,
    });
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

  // Phase 8 Localize V1 — detect transformable patterns and surface
  // them as offers. We do NOT modify the maker's bundle. Patches are
  // computed for inspection only; the maker reviews and accepts via
  // the dashboard.
  try {
    const allTransforms: LocalizeTransform[] = [
      'supabase-basic-queries',
      'supabase-storage-to-local-files',
      'authjs-to-local-identity',
    ];
    const patches = localize({ files: input.files, transforms: allTransforms });
    const offers = patches
      .filter((p) => p.fileChanges.length > 0 || p.newFiles.length > 0)
      .map((p) => ({
        transform: p.transform,
        fileChangeCount: p.fileChanges.length,
        newFileCount: p.newFiles.length,
        warnings: p.warnings,
        sampleFiles: p.fileChanges.slice(0, 3).map((c) => c.path),
      }));
    if (offers.length > 0) {
      report.localizeOffers = offers;
    }
  } catch (err) {
    console.error('[shippie:deploy] localize offers failed', err);
  }

  // Container commons package artifacts. This writes the metadata files plus
  // a verified portable archive containing the deployed app files, so the same
  // deploy can be installed from shippie.app, a Hub, or a local import.
  try {
    const packagePermissions = packagePermissionsFromManifest(input.manifest, input.slug);
    const packageTrustReport = packageTrustReportFromDeployReport(report);
    const builtPackage = await buildShippiePackage({
      app: {
        id: `app_${input.slug}`,
        slug: input.slug,
        name: input.manifest.name,
        description: input.manifest.description ?? input.manifest.tagline,
        kind: report.kind.public,
        entry: 'app/index.html',
        createdAt: report.generatedAt,
        maker: {
          id: input.makerId,
          name: input.makerId,
        },
        domains: {
          canonical: `https://${input.slug}.shippie.app`,
        },
        runtime: {
          standalone: true,
          container: packageTrustReport.containerEligibility !== 'standalone_only',
          hub: true,
          minimumSdk: '1.0.0',
        },
      },
      appFiles: input.files,
      version: {
        code: {
          version: String(input.version),
          channel: 'stable',
          packageHash: `sha256:${'0'.repeat(64)}`,
        },
        trust: {
          permissionsVersion: 1,
          externalDomains: packageTrustReport.privacy.externalDomains.map((d) => d.domain),
        },
        data: {
          schemaVersion: input.manifest.version ?? 1,
        },
      },
      permissions: packagePermissions,
      source: sourceMetadataFromManifest(input.manifest),
      trustReport: packageTrustReport,
      deployReport: report,
      migrations: input.manifest.migrations ?? { operations: [] },
    });

    const archiveKey = packageArtifactKey(input.slug, input.version, `${builtPackage.packageHash}.shippie`);
    const archiveBytes = await createShippiePackageArchive(builtPackage);
    const metadataFiles = [...builtPackage.files.entries()].filter(([path]) => !path.startsWith('app/'));
    await Promise.all(
      [
        input.r2.put(archiveKey, archiveBytes, {
          httpMetadata: { contentType: 'application/vnd.shippie.package+json' },
        }),
        ...metadataFiles.map(([path, bytes]) =>
          input.r2.put(packageArtifactKey(input.slug, input.version, path), bytes, {
            httpMetadata: {
              contentType: path.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream',
            },
          }),
        ),
      ],
    );

    report.package = {
      packageHash: builtPackage.packageHash,
      artifactPrefix: packageArtifactPrefix(input.slug, input.version),
      archiveKey,
      manifestKey: packageArtifactKey(input.slug, input.version, 'manifest.json'),
      metadataFiles: metadataFiles.length,
      totalPackageFiles: builtPackage.files.size,
    };

    const packageRecordValues = {
      appId: input.appId,
      deployId: input.deployId,
      version: String(input.version),
      channel: 'stable',
      packageHash: builtPackage.packageHash,
      artifactPrefix: report.package.artifactPrefix,
      manifestPath: report.package.manifestKey,
      permissionsPath: packageArtifactKey(input.slug, input.version, 'permissions.json'),
      trustReportPath: packageArtifactKey(input.slug, input.version, 'trust-report.json'),
      sourcePath: packageArtifactKey(input.slug, input.version, 'source.json'),
      deployReportPath: deployReportKey(input.slug, input.version),
      containerEligibility: packageTrustReport.containerEligibility,
    };
    await input.db
      .insert(schema.appPackages)
      .values(packageRecordValues)
      .onConflictDoUpdate({
        target: [schema.appPackages.deployId],
        set: packageRecordValues,
      });

    steps.push({
      id: 'package_artifact',
      title: 'Package artifact',
      status: 'ok',
      finishedAtMs: input.durationMs,
      notes: [`${metadataFiles.length} metadata files + archive · ${builtPackage.packageHash}`],
    });
  } catch (err) {
    steps.push({
      id: 'package_artifact',
      title: 'Package artifact',
      status: 'warn',
      finishedAtMs: input.durationMs,
      notes: [(err as Error).message],
    });
  }

  // Health check — runs in critical path; lightweight (manifest/SW/asset
  // resolution + installability hints). Full Lighthouse is async per the
  // master plan and not done here.
  try {
    const health = runHealthCheck(input.files);
    const failed = health.items.filter((i) => i.severity === 'fail').length;
    const warned = health.items.filter((i) => i.severity === 'warn').length;
    input.emitter.emit({
      type: 'health_check_finished',
      passed: health.passed,
      warnings: warned,
      failures: failed,
    });
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

function packagePermissionsFromManifest(manifest: ShippieJsonLite, slug: string): AppPermissions {
  const allowedDomains = (manifest.allowed_connect_domains ?? []).map((domain) => domain.toLowerCase());
  const capabilities: AppPermissions['capabilities'] = {
    localDb: { enabled: true, namespace: slug },
    localFiles: { enabled: true, namespace: slug },
    feedback: { enabled: true },
    analytics: { enabled: true, mode: 'aggregate-only' },
  };

  if (allowedDomains.length > 0) {
    capabilities.network = {
      allowedDomains,
      declaredPurpose: Object.fromEntries(
        allowedDomains.map((domain) => [domain, 'Declared external feature connection']),
      ),
    };
  }

  return {
    schema: SHIPPIE_PERMISSIONS_SCHEMA,
    capabilities,
  };
}

function packageTrustReportFromDeployReport(report: DeployReport): TrustReport {
  return {
    kind: {
      detected: report.kind.detected,
      status: report.kind.publicStatus,
      reasons: report.kind.reasons,
    },
    security: {
      stage: 'maker-facing',
      score: report.security.score?.value ?? null,
      findings: report.security.findings.map((finding) => `${finding.severity}: ${finding.title}`),
    },
    privacy: {
      grade: report.privacy.grade?.grade ?? null,
      externalDomains: report.privacy.domains.map((domain) => ({
        domain: domain.host,
        purpose: domain.category,
        personalData: domain.category === 'tracker',
      })),
    },
    containerEligibility: containerEligibilityFromDeployReport(report),
  };
}

export function containerEligibilityFromDeployReport(
  report: Pick<DeployReport, 'kind' | 'security' | 'privacy'>,
): ContainerEligibility {
  const score = report.security.score?.value ?? null;
  const grade = report.privacy.grade?.grade ?? null;

  if (report.security.blocks > 0 || grade === 'F' || (score !== null && score < 70)) {
    return 'blocked';
  }

  if (
    report.kind.detected === 'cloud' ||
    grade === 'C' ||
    score === null ||
    score < 90
  ) {
    return 'standalone_only';
  }

  if (grade === 'A+' || grade === 'A' || grade === 'B') {
    return 'compatible';
  }

  return 'standalone_only';
}

function sourceMetadataFromManifest(manifest: ShippieJsonLite): SourceMetadata {
  const license = manifest.license ?? 'UNLICENSED';
  const sourceAvailable = Boolean(manifest.source_repo);
  const remixAllowed = Boolean(manifest.remix_allowed && sourceAvailable && manifest.license);

  return {
    license,
    repo: manifest.source_repo,
    sourceAvailable,
    remix: {
      allowed: remixAllowed,
      commercialUse: remixAllowed,
      attributionRequired: true,
    },
    lineage: {
      template: manifest.template_id,
      parentAppId: manifest.parent_app_id,
      forkedFromVersion: manifest.parent_version,
    },
  };
}
