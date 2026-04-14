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
import {
  DevKv,
  DevR2,
  getDevKvDir,
  getDevR2AppsDir,
  type KvStore,
  type R2Store,
} from '@shippie/dev-storage';
import { createInjector } from '@shippie/pwa-injector';
import type { ShippieJson } from '@shippie/shared';
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
}

export async function deployStatic(
  input: DeployStaticInput,
): Promise<DeployStaticResult> {
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
  // 4. PWA injection
  // ------------------------------------------------------------------
  const version = 1; // TODO: bump from existing deploys row
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
  // 5. Upload to R2 (dev: filesystem)
  // ------------------------------------------------------------------
  const storage = getStorage();
  const r2Prefix = `apps/${input.slug}/v${version}`;

  for (const [path, buffer] of files) {
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    await storage.r2.put(`${r2Prefix}${cleanPath}`, new Uint8Array(buffer));
  }

  // ------------------------------------------------------------------
  // 6-8. KV app config + active pointer
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

  // ------------------------------------------------------------------
  // 9. TODO: write deploys row, update apps.active_deploy_id
  //    (comes in the next commit — for now the KV pointer is the source
  //    of truth that the Worker reads from)
  // ------------------------------------------------------------------

  const totalBytes = [...files.values()].reduce((acc, b) => acc + b.byteLength, 0);

  return {
    success: true,
    version,
    files: files.size,
    totalBytes,
    preflight,
    liveUrl: devUrl(input.slug),
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
