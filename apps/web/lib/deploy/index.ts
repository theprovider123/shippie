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
import { networkInterfaces } from 'node:os';
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
import { CfKv, CfR2 } from '@shippie/cf-storage';
import { createInjector } from '@shippie/pwa-injector';
import { schema } from '@shippie/db';
import { normalizeShippieJson, type ShippieJson } from '@shippie/shared';
import { getDb } from '@/lib/db';
import { runPreflight, defaultRules, type PreflightReport } from '@/lib/preflight';
import { generateAssets } from '@/lib/shippie/generate-assets';
import { scanForBaas } from '@/lib/trust/baas-scanner';
import { buildWrapperCompatibilityReport } from './wrapper-compat-report';

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
  /**
   * Info-level notes from the deploy pipeline, surfaced to the maker
   * alongside the live URL. Use for auto-enabled permissions, discovered
   * dependencies, and other "here's what Shippie did for you" signals.
   * Not a replacement for preflight warnings — those are in
   * `preflight.warnings`.
   */
  notes?: string[];
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
    // Zip slip hardening: reject absolute paths, parent-directory traversal,
    // Windows separators, and empty/pathological entry names before we touch
    // the filesystem or forward the path to R2. The worker prefix this with
    // `apps/{slug}/v{version}/` — a `../etc/passwd` there would climb out.
    const safe = sanitizeZipEntryPath(entry.entryName);
    if (!safe.ok) {
      return failReport({
        slug: input.slug,
        reason: `Unsafe path in zip: ${entry.entryName}`,
      });
    }
    files.set(safe.path, entry.getData());
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
  const manifestResult = deriveManifest(input, files);
  const { manifest: draftedManifest, notes: draftNotes } = manifestResult;
  if (manifestResult.error) {
    return failReport({
      slug: input.slug,
      reason: `Invalid shippie.json: ${manifestResult.error}`,
    });
  }

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
      fileContents: files,
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
  const iconAsset = resolveIconAsset(draftedManifest, files);
  let generatedIconUrl: string | null = null;
  let iconGenerationErrors: string[] = [];
  if (iconAsset) {
    try {
      const result = await generateAssets({
        slug: input.slug,
        iconBuffer: iconAsset.buffer,
        backgroundColor: draftedManifest.background_color ?? '#14120F',
        r2Public: storage.r2Public,
      });
      iconGenerationErrors = result.errors;
      if (result.iconKeys.length > 0) {
        generatedIconUrl = new URL('/__shippie/icons/512.png', resolveLiveUrl(input.slug)).toString();
      }
      if (result.errors.length > 0) {
        console.warn('[shippie:assets] partial:', result.errors.join('; '));
      }
    } catch (err) {
      iconGenerationErrors = [(err as Error).message];
      console.warn('[shippie:assets] failed:', err);
    }
  } else {
    console.warn(
      `[shippie:assets] no icon found for slug=${input.slug}; skipping icon + splash generation`,
    );
  }

  const wrapperCompat = buildWrapperCompatibilityReport({
    manifest: draftedManifest,
    preflight,
    trust,
    files,
    icon: {
      sourcePath: iconAsset?.path,
      generated: generatedIconUrl !== null,
      errors: iconGenerationErrors,
    },
  });

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
      autopackagingReport: {
        wrapper_compat: wrapperCompat,
      } as unknown as Record<string, unknown>,
      // Persist the CSP so rollback can restore it into KV without
      // replaying the trust pipeline. See lib/deploy/rollback.ts.
      cspHeader: trust.csp.header,
    })
    .where(eq(schema.deploys.id, deployRow.id));

  await db
    .update(schema.apps)
    .set({
      activeDeployId: deployRow.id,
      ...(generatedIconUrl ? { iconUrl: generatedIconUrl } : {}),
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
    liveUrl: resolveLiveUrl(input.slug),
    appId: appRow.id,
    deployId: deployRow.id,
    filesForCold: files,
    manifestForCold: draftedManifest,
    notes: draftNotes.length > 0 ? draftNotes : undefined,
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

export interface DerivedManifest {
  manifest: ShippieJson;
  /** Info-level notes generated during draft (e.g. auto-enabled permissions). */
  notes: string[];
  /** Fatal maker manifest parse/lowering error. */
  error?: string;
}

export function deriveManifest(
  input: DeployStaticInput,
  files: Map<string, Buffer>,
): DerivedManifest {
  // Maker-provided manifest always wins — we trust their declaration even
  // if it means leaving out a domain they use. The maker is the source of
  // truth; silently adding permissions to their manifest would be a
  // surprise-on-deploy.
  if (input.shippieJson) {
    return { manifest: { ...input.shippieJson, slug: input.slug }, notes: [] };
  }

  const provided = readShippieJson(files);
  if (provided.ok) {
    try {
      return {
        manifest: normalizeShippieJson(provided.value, {
          slug: input.slug,
          defaults: { theme_color: '#E8603C', background_color: '#ffffff', category: 'tools' },
        }),
        notes: ['Compiled maker shippie.json into Shippie internal runtime config.'],
      };
    } catch (err) {
      return {
        manifest: {
          version: 1,
          slug: input.slug,
          type: 'app',
          name: titleCase(input.slug),
          category: 'tools',
          theme_color: '#E8603C',
          background_color: '#ffffff',
        },
        notes: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  if (provided.error) {
    return {
      manifest: {
        version: 1,
        slug: input.slug,
        type: 'app',
        name: titleCase(input.slug),
        category: 'tools',
        theme_color: '#E8603C',
        background_color: '#ffffff',
      },
      notes: [],
      error: provided.error,
    };
  }

  const base: ShippieJson = {
    version: 1,
    slug: input.slug,
    type: 'app',
    name: titleCase(input.slug),
    category: 'tools',
    theme_color: '#E8603C',
    background_color: '#ffffff',
  };

  // Auto-detect BaaS hostnames so Supabase/Firebase/Clerk apps deployed
  // without a shippie.json actually work out of the box. Without this,
  // `connect-src 'self'` blocks their backend calls and the maker sees a
  // silent CSP failure they can't debug.
  const baas = scanForBaas(files);
  const notes: string[] = [];

  if (baas.found) {
    const existing = new Set((base.allowed_connect_domains ?? []).map((d) => d.toLowerCase()));
    for (const d of baas.domains) existing.add(d);
    const merged = [...existing].sort();

    base.permissions = { ...(base.permissions ?? {}), external_network: true };
    base.allowed_connect_domains = merged;

    notes.push(
      `Auto-detected ${baas.providers.join(' + ')} — external network allowed for: ${baas.domains.join(', ')}`,
    );
  }

  return { manifest: base, notes };
}

function readShippieJson(files: Map<string, Buffer>): { ok: true; value: unknown } | { ok: false; error?: string } {
  const buf = files.get('shippie.json');
  if (!buf) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(buf.toString('utf8')) as unknown };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
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
export interface ResolvedIconAsset {
  path: string;
  buffer: Buffer;
  source: 'shippie_json' | 'web_manifest' | 'fallback';
}

export function resolveIconAsset(
  manifest: ShippieJson,
  files: Map<string, Buffer>,
): ResolvedIconAsset | null {
  const candidates: Array<{ path: string; source: ResolvedIconAsset['source'] }> = [];
  if (manifest.icon) candidates.push({ path: manifest.icon.replace(/^\/+/, ''), source: 'shippie_json' });
  candidates.push(...manifestIconCandidates(files));
  for (const fallback of ['icon.png', 'icon.svg', 'favicon.png', 'favicon.svg', 'public/icon.png']) {
    candidates.push({ path: fallback, source: 'fallback' });
  }

  for (const candidate of candidates) {
    const normalized = normalizeAssetPath(candidate.path);
    const buf = files.get(normalized);
    if (buf) return { path: normalized, buffer: buf, source: candidate.source };
  }
  return null;
}

interface WebManifestIcon {
  src?: unknown;
  sizes?: unknown;
  purpose?: unknown;
}

function manifestIconCandidates(files: Map<string, Buffer>): Array<{ path: string; source: 'web_manifest' }> {
  const out: Array<{ path: string; source: 'web_manifest' }> = [];
  for (const path of ['manifest.json', 'site.webmanifest', 'public/manifest.json']) {
    const buf = files.get(path);
    if (!buf) continue;
    try {
      const manifest = JSON.parse(buf.toString('utf8')) as { icons?: WebManifestIcon[] };
      if (!Array.isArray(manifest.icons)) continue;
      const baseDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
      const icons = manifest.icons
        .filter((icon) => typeof icon.src === 'string')
        .sort((a, b) => iconRank(b) - iconRank(a));
      for (const icon of icons) {
        const src = icon.src as string;
        out.push({ path: resolveManifestAssetPath(baseDir, src), source: 'web_manifest' });
      }
    } catch {
      // Ignore malformed web manifests here. shippie.json validation is
      // handled separately; browser manifest files are best-effort inputs.
    }
  }
  return out;
}

function iconRank(icon: WebManifestIcon): number {
  const sizes = typeof icon.sizes === 'string' ? icon.sizes : '';
  const purpose = typeof icon.purpose === 'string' ? icon.purpose : '';
  const maxSize = sizes
    .split(/\s+/)
    .map((part) => /^(\d+)x\1$/.exec(part)?.[1])
    .filter((n): n is string => Boolean(n))
    .map((n) => Number(n))
    .sort((a, b) => b - a)[0] ?? 0;
  return maxSize + (purpose.includes('any') ? 1 : 0);
}

function resolveManifestAssetPath(baseDir: string, src: string): string {
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith('/')) return src.replace(/^\/+/, '');
  return `${baseDir}${src}`.replace(/\/\.\//g, '/');
}

function normalizeAssetPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/^\/+/, '');
}

interface Storage {
  kv: KvStore;
  r2: R2Store;
  /** Public assets bucket — icons, splashes, OG, QR. */
  r2Public: R2Store;
}

let cachedStorage: Storage | null = null;

/**
 * Return the storage bundle for the current environment. In prod
 * (`SHIPPIE_ENV === 'production'` or `NODE_ENV === 'production'` with
 * `CF_ACCOUNT_ID` set) this returns Cloudflare-backed adapters; in dev
 * it falls back to filesystem-backed DevKv/DevR2 under
 * `.shippie-dev-state/`. Missing prod env vars fail loudly with a
 * single error listing all of them, not a confusing null-deref later.
 */
function getStorage(): Storage {
  if (cachedStorage) return cachedStorage;
  const built: Storage = isProdStorageSelected() ? buildCfStorage() : buildDevStorage();
  cachedStorage = built;
  return built;
}

function buildDevStorage(): Storage {
  return {
    kv: new DevKv(getDevKvDir()),
    r2: new DevR2(getDevR2AppsDir()),
    r2Public: new DevR2(getDevR2PublicDir()),
  };
}

function buildCfStorage(): Storage {
  const cfg = requireCfEnv();
  const apps = new CfR2({
    accountId: cfg.accountId,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    bucket: cfg.bucketApps,
  });
  const pub = new CfR2({
    accountId: cfg.accountId,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    bucket: cfg.bucketPublic,
  });
  return {
    kv: new CfKv({
      accountId: cfg.accountId,
      namespaceId: cfg.kvNamespaceId,
      apiToken: cfg.apiToken,
    }),
    r2: apps,
    r2Public: pub,
  };
}

function isProdStorageSelected(): boolean {
  if (process.env.SHIPPIE_ENV === 'production') return true;
  if (process.env.NODE_ENV === 'production' && process.env.CF_ACCOUNT_ID) return true;
  return false;
}

interface CfEnvConfig {
  accountId: string;
  apiToken: string;
  kvNamespaceId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketApps: string;
  bucketPublic: string;
}

function requireCfEnv(): CfEnvConfig {
  const required: Record<keyof CfEnvConfig, string | undefined> = {
    accountId: process.env.CF_ACCOUNT_ID,
    apiToken: process.env.CF_API_TOKEN,
    kvNamespaceId: process.env.CF_KV_NAMESPACE_ID,
    accessKeyId: process.env.CF_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY,
    bucketApps: process.env.CF_R2_BUCKET_APPS,
    bucketPublic: process.env.CF_R2_BUCKET_PUBLIC,
  };
  const envKey: Record<keyof CfEnvConfig, string> = {
    accountId: 'CF_ACCOUNT_ID',
    apiToken: 'CF_API_TOKEN',
    kvNamespaceId: 'CF_KV_NAMESPACE_ID',
    accessKeyId: 'CF_R2_ACCESS_KEY_ID',
    secretAccessKey: 'CF_R2_SECRET_ACCESS_KEY',
    bucketApps: 'CF_R2_BUCKET_APPS',
    bucketPublic: 'CF_R2_BUCKET_PUBLIC',
  };
  const missing: string[] = [];
  for (const k of Object.keys(required) as Array<keyof CfEnvConfig>) {
    if (!required[k]) missing.push(envKey[k]);
  }
  if (missing.length > 0) {
    throw new Error(
      `[shippie:deploy] Production storage selected but missing env vars: ${missing.join(', ')}. ` +
        `See packages/cf-storage/README.md for setup.`,
    );
  }
  return required as CfEnvConfig;
}

/**
 * Resolve the public live URL for a slug.
 *   - If `SHIPPIE_PUBLIC_HOST` is set, use `https://{slug}.{host}/`.
 *   - Otherwise, in dev, build a nip.io URL wrapping the detected LAN
 *     IP so phones on the same Wi-Fi can hit the worker without editing
 *     `/etc/hosts`. Falls back to `localhost` if no LAN IP is detected
 *     or if `SHIPPIE_DEV_FORCE_LOCALHOST` is set.
 */
export function resolveLiveUrl(slug: string): string {
  const publicHost = process.env.SHIPPIE_PUBLIC_HOST;
  if (publicHost) return `https://${slug}.${publicHost}/`;

  const port = process.env.SHIPPIE_WORKER_PORT ?? '4200';
  if (process.env.SHIPPIE_DEV_FORCE_LOCALHOST) {
    return `http://${slug}.localhost:${port}/`;
  }
  const lanIp = detectLanIp();
  if (!lanIp) return `http://${slug}.localhost:${port}/`;
  const dashed = lanIp.replaceAll('.', '-');
  return `http://${slug}.${dashed}.nip.io:${port}/`;
}

let cachedLanIp: string | null | undefined;

function detectLanIp(): string | null {
  if (cachedLanIp !== undefined) return cachedLanIp;
  try {
    const ifaces = networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      const list = ifaces[name];
      if (!list) continue;
      for (const entry of list) {
        if (entry.family === 'IPv4' && !entry.internal && entry.address) {
          cachedLanIp = entry.address;
          return cachedLanIp;
        }
      }
    }
  } catch {
    // node:os not available or errored — fall through to null
  }
  cachedLanIp = null;
  return cachedLanIp;
}

/**
 * Validate a zip entry's path. Returns the normalized safe path, or
 * `{ ok: false }` on traversal/absolute/pathological inputs.
 *
 * Normalization is done with POSIX semantics (no OS-specific resolution
 * against a root) so cross-platform archives produce deterministic
 * results.
 */
function sanitizeZipEntryPath(raw: string): { ok: true; path: string } | { ok: false } {
  if (!raw) return { ok: false };
  // Reject explicit Windows separators or escaped-up components before
  // normalization — `path.posix.normalize` leaves `\\..\\` as-is and
  // we don't want to ship a backslash-in-key to R2 either.
  if (raw.includes('\\')) return { ok: false };
  // Strip any leading slashes so the entry is always bucket-relative.
  // An entry that was only slashes normalizes to '' below and is
  // rejected.
  const stripped = raw.replace(/^\/+/, '');
  if (!stripped) return { ok: false };
  const normalized = posixNormalize(stripped);
  if (!normalized) return { ok: false };
  if (normalized.startsWith('/')) return { ok: false };
  if (normalized === '..' || normalized.startsWith('../')) return { ok: false };
  if (normalized.includes('/../')) return { ok: false };
  return { ok: true, path: normalized };
}

// Tiny POSIX-style normalizer that collapses `.` and `..` segments
// without resolving against any filesystem root. `..` components that
// would escape the top level are preserved as literal `..` so the
// caller's traversal check above can reject them.
function posixNormalize(p: string): string {
  const parts = p.split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length === 0 || out[out.length - 1] === '..') {
        out.push('..');
      } else {
        out.pop();
      }
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}
