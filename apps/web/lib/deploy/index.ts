/**
 * Deploy pipeline — static upload flow.
 *
 * The end-to-end Quick Ship path for zip uploads:
 *   1. Extract zip into memory
 *   2. Run preflight against the file list + auto-drafted shippie.json
 *   3. Reject on blockers, warn on warnings
 *   4. Run PWA injection on every .html file
 *   5. Generate __shippie/manifest and __shippie/sw.js
 *   6. Write files to R2 at `apps/{slug}/v{version}/*`
 *   7. Write app config to KV at `apps:{slug}:meta`
 *   8. Flip `apps:{slug}:active` pointer to the new version
 *   9. Insert `deploys` row, link via `apps.active_deploy_id`
 *
 * Spec v6 §10.6.
 */
import AdmZip from 'adm-zip';
import { and, eq } from 'drizzle-orm';
import {
  DevKv,
  DevR2,
  getDevKvDir,
  getDevR2AppsDir,
  type KvStore,
  type R2Store,
} from '@shippie/dev-storage';
import { createInjector } from '@shippie/pwa-injector';
import { schema } from '@shippie/db';
import type { ShippieJson } from '@shippie/shared';
import { getDb } from '@/lib/db';
import { runPreflight, defaultRules, type PreflightReport } from '@/lib/preflight';

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
}

export async function deployStatic(
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
        themeColor: draftedManifest.theme_color ?? '#000000',
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
  // 6. PWA injection
  // ------------------------------------------------------------------
  const injector = createInjector(draftedManifest, version);

  for (const [path, buffer] of files) {
    if (path.endsWith('.html') || path.endsWith('.htm')) {
      const original = buffer.toString('utf8');
      const { html, modified } = injector.injectHtml(original);
      if (modified) {
        files.set(path, Buffer.from(html, 'utf8'));
      }
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

  // Ensure an app_permissions row exists (idempotent upsert)
  await db
    .insert(schema.appPermissions)
    .values({
      appId: appRow.id,
      auth: draftedManifest.permissions?.auth ?? false,
      storage: draftedManifest.permissions?.storage ?? 'none',
      files: draftedManifest.permissions?.files ?? false,
      notifications: draftedManifest.permissions?.notifications ?? false,
      analytics: draftedManifest.permissions?.analytics ?? true,
      externalNetwork: draftedManifest.permissions?.external_network ?? false,
    })
    .onConflictDoNothing();

  // ------------------------------------------------------------------
  // 9. Write KV app config + active pointer (read-through cache for worker)
  // ------------------------------------------------------------------
  await storage.kv.putJson(`apps:${input.slug}:meta`, {
    slug: input.slug,
    name: draftedManifest.name,
    type: draftedManifest.type,
    theme_color: draftedManifest.theme_color ?? '#f97316',
    background_color: draftedManifest.background_color ?? '#ffffff',
    version,
    permissions: draftedManifest.permissions ?? {
      auth: false,
      storage: 'none',
      files: false,
      notifications: false,
      analytics: true,
    },
  });

  await storage.kv.put(`apps:${input.slug}:active`, String(version));

  return {
    success: true,
    version,
    files: files.size,
    totalBytes,
    preflight,
    liveUrl: devUrl(input.slug),
    appId: appRow.id,
    deployId: deployRow.id,
  };
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
    theme_color: '#f97316',
    background_color: '#ffffff',
  };
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : ''))
    .join(' ');
}

interface Storage {
  kv: KvStore;
  r2: R2Store;
}

let cachedStorage: Storage | null = null;

function getStorage(): Storage {
  if (cachedStorage) return cachedStorage;
  cachedStorage = {
    kv: new DevKv(getDevKvDir()),
    r2: new DevR2(getDevR2AppsDir()),
  };
  return cachedStorage;
}

function devUrl(slug: string): string {
  const port = process.env.SHIPPIE_WORKER_PORT ?? '4200';
  return `http://${slug}.localhost:${port}/`;
}
