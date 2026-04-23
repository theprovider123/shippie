/**
 * Deploy pipeline — static upload flow.
 *
 * Split into a HOT path (blocks the response) and a COLD path (runs async
 * after the URL is returned). Time-to-URL is the metric that matters for
 * makers; everything non-essential to URL readiness belongs in the cold path.
 *
 *   HOT:
 *     1. Extract zip into memory
 *     2. Preflight against file list + auto-drafted shippie.json
 *     3. Upsert app + deploys row
 *     4. Trust checks (malware + domain + CSP + listing gate)  — blocks publish
 *     5. PWA injection
 *     6. Write files to R2 at apps/{slug}/v{version}/*
 *     7. Mark deploy success, flip apps.active_deploy_id
 *     8. Write KV meta + active pointer
 *     ↳ return URL. Downstream sees the app as live.
 *
 *   COLD (runs via deployCold()):
 *     9. Ranking score recompute
 *    10. Auto-packaging (compat report, changelog, QR, OG card)
 *
 * Status is surfaced via deploys.autopackaging_status:
 *   'pending'  — hot finished, cold queued
 *   'partial'  — cold ran with some failures
 *   'complete' — cold ran successfully
 *
 * Spec v6 §10.6. Differentiation plan Pillar C1.
 */
import AdmZip from 'adm-zip';
import { and, eq } from 'drizzle-orm';
import {
  DevKv,
  DevR2,
  getDevKvDir,
  getDevR2AppsDir,
  getDevR2PublicDir,
  type KvStore,
  type R2Store,
} from '@shippie/dev-storage';
import { createInjector } from '@shippie/pwa-injector';
import { schema } from '@shippie/db';
import type { ShippieJson } from '@shippie/shared';
import { getDb } from '@/lib/db';
import { runPreflight, defaultRules, type PreflightReport } from '@/lib/preflight';
import { generateAssets } from '@/lib/shippie/generate-assets';

export interface DeployStaticInput {
  slug: string;
  makerId: string;
  zipBuffer: Buffer;
  /** Maker-provided manifest; if null/undefined we auto-draft. */
  shippieJson?: ShippieJson;
  reservedSlugs: ReadonlySet<string>;
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
  /** Hot path only — files map for cold path autopack (ephemeral). */
  filesForCold?: Map<string, Buffer>;
  /** Hot path only — the drafted manifest for cold path autopack. */
  manifestForCold?: ShippieJson;
}

/**
 * Hot path: everything that needs to finish before the URL works.
 * Returns as soon as the KV pointer is flipped. Callers should kick off
 * `deployCold()` after the response is sent (via `after()` or equivalent).
 */
export async function deployStaticHot(
  input: DeployStaticInput,
): Promise<DeployStaticResult> {
  const startedAt = Date.now();
  // ------------------------------------------------------------------
  // 1. Extract zip
  // ------------------------------------------------------------------
  const zip = new AdmZip(input.zipBuffer);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  const files = new Map<string, Buffer>();
  for (const entry of entries) {
    const path = entry.entryName.replace(/^\/+/, '');
    files.set(path, entry.getData());
  }

  if (files.size === 0) {
    return failReport({
      slug: input.slug,
      reason: 'Zip archive contains no files.',
    });
  }

  // ------------------------------------------------------------------
  // 2. Manifest (auto-draft if missing)
  // ------------------------------------------------------------------
  const draftedManifest = deriveManifest(input, files);

  // ------------------------------------------------------------------
  // 3. Preflight
  // ------------------------------------------------------------------
  const outputBytes = [...files.values()].reduce((acc, b) => acc + b.byteLength, 0);

  const preflight = await runPreflight(
    {
      manifest: draftedManifest,
      manifestSource: input.shippieJson ? 'maker' : 'auto-drafted',
      sourceFiles: Array.from(files.keys()),
      outputFiles: Array.from(files.keys()),
      outputBytes,
      reservedSlugs: input.reservedSlugs,
    },
    defaultRules,
  );

  if (!preflight.passed) {
    return {
      success: false,
      version: 0,
      files: files.size,
      totalBytes: outputBytes,
      preflight,
      liveUrl: '',
      reason: preflight.blockers.map((b) => b.title).join(' · '),
    };
  }

  // ------------------------------------------------------------------
  // 4. Upsert the apps row (before injection so we know the version)
  // ------------------------------------------------------------------
  const db = await getDb();

  let appRow = await db.query.apps.findFirst({
    where: eq(schema.apps.slug, input.slug),
  });

  if (!appRow) {
    const [inserted] = await db
      .insert(schema.apps)
      .values({
        slug: input.slug,
        name: draftedManifest.name,
        tagline: draftedManifest.tagline,
        description: draftedManifest.description,
        type: draftedManifest.type,
        category: draftedManifest.category,
        themeColor: draftedManifest.theme_color ?? '#14120F',
        backgroundColor: draftedManifest.background_color ?? '#ffffff',
        sourceType: 'zip',
        makerId: input.makerId,
      })
      .returning();
    if (!inserted) {
      return failReport({ slug: input.slug, reason: 'Failed to create app row' });
    }
    appRow = inserted;
  } else if (appRow.makerId !== input.makerId) {
    return failReport({
      slug: input.slug,
      reason: `Slug '${input.slug}' is already claimed by another maker.`,
    });
  }

  // Determine next version = max(existing versions) + 1
  const latest = await db
    .select({ version: schema.deploys.version })
    .from(schema.deploys)
    .where(eq(schema.deploys.appId, appRow.id))
    .orderBy(schema.deploys.version);
  const version = (latest.length > 0 ? latest[latest.length - 1]!.version : 0) + 1;

  // ------------------------------------------------------------------
  // 5. Create the deploys row in 'building' state so the trigger fires
  //    and apps.latest_deploy_* get populated.
  // ------------------------------------------------------------------
  const [deployRow] = await db
    .insert(schema.deploys)
    .values({
      appId: appRow.id,
      version,
      sourceType: 'zip',
      status: 'building',
      shippieJson: draftedManifest as unknown as Record<string, unknown>,
      createdBy: input.makerId,
    })
    .returning();
  if (!deployRow) {
    return failReport({ slug: input.slug, reason: 'Failed to create deploy row' });
  }

  // ------------------------------------------------------------------
  // 5.5. Trust enforcement — malware + domain scan + listing gate + CSP
  // ------------------------------------------------------------------
  const { runTrustChecks } = await import('@/lib/trust');
  const trust = await runTrustChecks({
    db,
    appId: appRow.id,
    deployId: deployRow.id,
    files,
    manifest: draftedManifest,
    visibility: 'unlisted', // MVP default; public gate opts in at publish time
  });
  if (!trust.passed) {
    await db
      .update(schema.deploys)
      .set({ status: 'failed', completedAt: new Date() })
      .where(eq(schema.deploys.id, deployRow.id));
    return failReport({
      slug: input.slug,
      reason: `trust: ${trust.blockers.join(' · ')}`,
    });
  }

  // ------------------------------------------------------------------
  // 6. PWA injection (+ CSP meta tag)
  // ------------------------------------------------------------------
  const injector = createInjector(draftedManifest, version);
  const cspMeta = trust.csp.metaTag + '\n';

  for (const [path, buffer] of files) {
    if (path.endsWith('.html') || path.endsWith('.htm')) {
      const original = buffer.toString('utf8');
      const { html, modified } = injector.injectHtml(original);
      const withCsp = (modified ? html : original).replace(/<head([^>]*)>/i, `<head$1>${cspMeta}`);
      files.set(path, Buffer.from(withCsp, 'utf8'));
    }
  }

  // ------------------------------------------------------------------
  // 7. Upload to R2 (dev: filesystem, prod: Cloudflare)
  // ------------------------------------------------------------------
  const storage = getStorage();
  const r2Prefix = `apps/${input.slug}/v${version}`;
  const manifest: Array<{ path: string; size: number }> = [];

  for (const [path, buffer] of files) {
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    await storage.r2.put(`${r2Prefix}${cleanPath}`, new Uint8Array(buffer));
    manifest.push({ path: cleanPath, size: buffer.byteLength });
  }

  const totalBytes = [...files.values()].reduce((acc, b) => acc + b.byteLength, 0);

  // ------------------------------------------------------------------
  // 7.5. Generate + upload PWA icons + iOS splash images (best-effort).
  //
  // Reads the icon declared at `shippie.json.icon` (resolved against the
  // build output, with a fallback to common default paths). Writes
  // derived icon + splash PNGs to the public R2 bucket. Failures are
  // logged, not fatal — the worker's icon route falls back to the
  // platform default placeholder.
  // ------------------------------------------------------------------
  const iconBuffer = resolveIconBuffer(draftedManifest, files);
  if (iconBuffer) {
    try {
      const result = await generateAssets({
        slug: input.slug,
        iconBuffer,
        backgroundColor: draftedManifest.background_color ?? '#14120F',
        r2Public: storage.r2Public,
      });
      if (result.errors.length > 0) {
        console.warn('[shippie:assets] partial:', result.errors.join('; '));
      }
    } catch (err) {
      console.warn('[shippie:assets] failed:', err);
    }
  } else {
    console.warn(
      `[shippie:assets] no icon found for slug=${input.slug}; skipping icon + splash generation`,
    );
  }

  // ------------------------------------------------------------------
  // 8. Create deploy_artifacts + mark deploy success + flip active pointer
  // ------------------------------------------------------------------
  await db.insert(schema.deployArtifacts).values({
    deployId: deployRow.id,
    r2Prefix,
    fileCount: files.size,
    totalBytes: BigInt(totalBytes),
    manifest: { files: manifest } as unknown as Record<string, unknown>,
  });

  await db
    .update(schema.deploys)
    .set({
      status: 'success',
      completedAt: new Date(),
      durationMs: Date.now() - startedAt,
      preflightStatus: 'passed',
      preflightReport: preflight as unknown as Record<string, unknown>,
      // Persist the CSP so rollback can restore it into KV without
      // replaying the trust pipeline. See lib/deploy/rollback.ts.
      cspHeader: trust.csp.header,
    })
    .where(eq(schema.deploys.id, deployRow.id));

  await db
    .update(schema.apps)
    .set({
      activeDeployId: deployRow.id,
      lastDeployedAt: new Date(),
      firstPublishedAt: appRow.firstPublishedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.apps.id, appRow.id));

  // Upsert app_permissions — always reflect the latest manifest on every deploy
  const permValues = {
    auth: draftedManifest.permissions?.auth ?? false,
    storage: draftedManifest.permissions?.storage ?? 'none',
    files: draftedManifest.permissions?.files ?? false,
    notifications: draftedManifest.permissions?.notifications ?? false,
    analytics: draftedManifest.permissions?.analytics ?? true,
    externalNetwork: draftedManifest.permissions?.external_network ?? false,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.appPermissions)
    .values({ appId: appRow.id, ...permValues })
    .onConflictDoUpdate({
      target: [schema.appPermissions.appId],
      set: permValues,
    });

  // ------------------------------------------------------------------
  // 9. Write KV app config + active pointer (read-through cache for worker)
  //
  // Order matters: meta + csp first, then `active` last. The worker reads
  // `active` per-request as the version the app should serve, but reads
  // `meta` and `csp` independently on the same request. Writing `active`
  // last means a crash mid-sequence leaves the previous version coherently
  // exposed under its own meta/csp; only after `active` flips does the new
  // version become visible to the worker. The reaper in
  // lib/deploy/reconcile-kv.ts backstops the remaining non-atomic window.
  // ------------------------------------------------------------------
  await storage.kv.putJson(`apps:${input.slug}:meta`, {
    slug: input.slug,
    name: draftedManifest.name,
    type: draftedManifest.type,
    theme_color: draftedManifest.theme_color ?? '#E8603C',
    background_color: draftedManifest.background_color ?? '#ffffff',
    version,
    backend_type: (draftedManifest as { backend?: { provider?: string } }).backend?.provider ?? null,
    backend_url: (draftedManifest as { backend?: { url?: string } }).backend?.url ?? null,
    visibility_scope: appRow.visibilityScope,
    permissions: draftedManifest.permissions ?? {
      auth: false,
      storage: 'none',
      files: false,
      notifications: false,
      analytics: true,
    },
  });

  // Per-app CSP header. Includes allowed_connect_domains from the trust
  // pipeline, enabling BYO backend requests.
  await storage.kv.put(`apps:${input.slug}:csp`, trust.csp.header);

  // Flip-last: atomic swap from the worker's read perspective.
  await storage.kv.put(`apps:${input.slug}:active`, String(version));

  // Flag cold work as queued.
  await db
    .update(schema.deploys)
    .set({ autopackagingStatus: 'pending' })
    .where(eq(schema.deploys.id, deployRow.id));

  return {
    success: true,
    version,
    files: files.size,
    totalBytes,
    preflight,
    liveUrl: devUrl(input.slug),
    appId: appRow.id,
    deployId: deployRow.id,
    filesForCold: files,
    manifestForCold: draftedManifest,
  };
}

/**
 * Cold path: ranking recompute + auto-packaging. Run after the hot path
 * has returned the URL to the caller. Safe to call-and-ignore — errors
 * are swallowed and logged, and autopackaging_status is updated in place
 * so `/api/deploy/[id]/status` can report progress.
 */
export interface DeployColdInput {
  appId: string;
  deployId: string;
  slug: string;
  version: number;
  files: Map<string, Buffer>;
  manifest: ShippieJson;
}

export async function deployCold(input: DeployColdInput): Promise<void> {
  const db = await getDb();
  const storage = getStorage();

  try {
    const { computeRankingForApp } = await import('@/lib/ranking');
    await computeRankingForApp(db, input.appId);
  } catch (err) {
    console.warn('[shippie:ranking] failed:', err);
  }

  try {
    const { runAutoPack } = await import('@/lib/autopack');
    const pack = await runAutoPack({
      db,
      r2: storage.r2,
      appId: input.appId,
      deployId: input.deployId,
      slug: input.slug,
      version: input.version,
      files: input.files,
      manifest: input.manifest,
    });
    if (pack.errors.length > 0) {
      console.warn('[shippie:autopack] partial:', pack.errors.join('; '));
    }
    // `runAutoPack` updates autopackagingStatus itself; nothing to do.
  } catch (err) {
    console.error('[shippie:autopack] failed:', err);
    try {
      await db
        .update(schema.deploys)
        .set({ autopackagingStatus: 'partial' })
        .where(eq(schema.deploys.id, input.deployId));
    } catch {
      // best-effort — cold path errors shouldn't cascade
    }
  }
}

/**
 * Convenience: the pre-C1 synchronous flow. Useful for tests and any
 * caller that doesn't have a post-response hook. New callers should
 * prefer `deployStaticHot` + `deployCold` on a platform-appropriate
 * background hook (Next.js `after()` in App Router handlers).
 */
export async function deployStatic(
  input: DeployStaticInput,
): Promise<DeployStaticResult> {
  const hot = await deployStaticHot(input);
  if (hot.success && hot.appId && hot.deployId && hot.filesForCold && hot.manifestForCold) {
    await deployCold({
      appId: hot.appId,
      deployId: hot.deployId,
      slug: input.slug,
      version: hot.version,
      files: hot.filesForCold,
      manifest: hot.manifestForCold,
    });
  }
  return hot;
}

function failReport(opts: { slug: string; reason: string }): DeployStaticResult {
  return {
    success: false,
    version: 0,
    files: 0,
    totalBytes: 0,
    preflight: {
      passed: false,
      findings: [],
      remediations: [],
      warnings: [],
      blockers: [
        {
          rule: 'zip-extraction',
          severity: 'block',
          title: opts.reason,
        },
      ],
      durationMs: 0,
    },
    liveUrl: '',
    reason: opts.reason,
  };
}

function deriveManifest(
  input: DeployStaticInput,
  _files: Map<string, Buffer>,
): ShippieJson {
  if (input.shippieJson) {
    return { ...input.shippieJson, slug: input.slug };
  }

  return {
    version: 1,
    slug: input.slug,
    type: 'app',
    name: titleCase(input.slug),
    category: 'tools',
    theme_color: '#E8603C',
    background_color: '#ffffff',
  };
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : ''))
    .join(' ');
}

/**
 * Resolve the source icon buffer from the build output. Honors
 * `shippie.json.icon` if it points to an existing file, otherwise
 * falls back to common default names at the root of the zip.
 */
function resolveIconBuffer(
  manifest: ShippieJson,
  files: Map<string, Buffer>,
): Buffer | null {
  const candidates: string[] = [];
  if (manifest.icon) candidates.push(manifest.icon.replace(/^\/+/, ''));
  candidates.push('icon.png', 'icon.svg', 'favicon.png', 'favicon.svg', 'public/icon.png');

  for (const candidate of candidates) {
    const buf = files.get(candidate);
    if (buf) return buf;
  }
  return null;
}

interface Storage {
  kv: KvStore;
  r2: R2Store;
  /** Public assets bucket — icons, splashes, OG, QR. */
  r2Public: R2Store;
}

let cachedStorage: Storage | null = null;

function getStorage(): Storage {
  if (cachedStorage) return cachedStorage;
  cachedStorage = {
    kv: new DevKv(getDevKvDir()),
    r2: new DevR2(getDevR2AppsDir()),
    r2Public: new DevR2(getDevR2PublicDir()),
  };
  return cachedStorage;
}

function devUrl(slug: string): string {
  const port = process.env.SHIPPIE_WORKER_PORT ?? '4200';
  return `http://${slug}.localhost:${port}/`;
}
