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
import { analyseApp } from '@shippie/analyse';
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
} from './kv-write';
import { buildCsp } from './csp';

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
 * Lightweight HTML injection — adds the CSP meta tag, a PWA manifest
 * link, and the Shippie SDK boot script tag to every HTML file's <head>.
 *
 * Ports the minimum needed to make the runtime worker happy. The full
 * @shippie/pwa-injector lives in apps/web; we'll port it to a worker
 * package in Phase 5 (wrapper rewriter port). Until then, the runtime
 * worker still does manifest + SDK injection client-side via HTMLRewriter.
 */
function injectIntoHtmlFiles(
  files: Map<string, Uint8Array>,
  cspMetaTag: string,
  _manifest: ShippieJsonLite,
  _version: number,
): void {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  for (const [path, body] of files) {
    if (!path.endsWith('.html') && !path.endsWith('.htm')) continue;
    const original = decoder.decode(body);
    const withCsp = original.replace(/<head([^>]*)>/i, `<head$1>${cspMetaTag}\n`);
    if (withCsp !== original) {
      files.set(path, encoder.encode(withCsp));
    }
  }
}
