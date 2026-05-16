#!/usr/bin/env bun

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLATFORM_DIR = join(SCRIPT_DIR, '..');
const REPO_ROOT = join(PLATFORM_DIR, '..', '..');
const APPS_DIR = join(REPO_ROOT, 'apps');
const STATIC_RUN_DIR = join(PLATFORM_DIR, 'static', '__shippie-run');
const GENERATED_CATALOG = join(PLATFORM_DIR, 'src', 'lib', '_generated', 'showcase-catalog.ts');
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.svelte']);
const IGNORED_DIRS = new Set(['.svelte-kit', 'dist', 'node_modules', 'coverage']);
const DATA_INHERITANCE_SKIP = new Set(['crewtrip']);

const storagePatterns = {
  localDb: /\bshippie\s*\.\s*local\s*\.\s*db\b|\blocal\s*\.\s*db\b|window\.shippie\?\.\s*local\?\.\s*db/,
  localStorage: /\blocalStorage\b/,
  indexedDb: /\bindexedDB\b|\bnavigator\.storage\.getDirectory\b/
};

function readText(path) {
  return readFileSync(path, 'utf8');
}

function listDirs(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path)
    .map((entry) => join(path, entry))
    .filter((entryPath) => statSync(entryPath).isDirectory())
    .sort();
}

function walkFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  const stack = [root];

  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) stack.push(join(current, entry.name));
        continue;
      }

      const extension = entry.name.match(/\.[^.]+$/)?.[0] ?? '';
      if (SOURCE_EXTENSIONS.has(extension)) files.push(join(current, entry.name));
    }
  }

  return files.sort();
}

function sourceSlug(appDir) {
  const manifestPath = join(appDir, 'shippie.json');
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readText(manifestPath));
      if (typeof manifest.slug === 'string' && manifest.slug.trim()) return manifest.slug.trim();
    } catch {
      // Fall back to the directory name below; malformed manifests are caught elsewhere.
    }
  }

  return appDir.split('/').at(-1)?.replace(/^showcase-/, '') ?? '';
}

function readManifest(appDir) {
  const manifestPath = join(appDir, 'shippie.json');
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readText(manifestPath));
  } catch {
    return null;
  }
}

function dataPolicyState(app) {
  if (DATA_INHERITANCE_SKIP.has(app.slug)) return { ok: true, detail: 'skipped for now' };
  const data = app.manifest && typeof app.manifest.data === 'object' && app.manifest.data !== null
    ? app.manifest.data
    : null;
  if (!data) return { ok: true, detail: 'inherits default sealed copies' };
  if (data.mode !== 'shippie-documents') return { ok: false, detail: `data.mode is ${String(data.mode)}` };
  if (data.recovery !== 'inherited') return { ok: false, detail: 'data.recovery must be inherited' };
  if (data.realtime !== 'inherited') return { ok: false, detail: 'data.realtime must be inherited' };
  if (!Array.isArray(data.documents) || data.documents.length === 0) return { ok: false, detail: 'data.documents is empty' };
  return { ok: true, detail: 'declared sealed copies' };
}

function generatedSlugs() {
  if (!existsSync(GENERATED_CATALOG)) return [];
  const text = readText(GENERATED_CATALOG);
  const match = text.match(/export const SHOWCASE_SLUGS = (\[[\s\S]*?\]) as const;/);
  if (!match) return [];
  return JSON.parse(match[1]);
}

function staticSlugs() {
  return listDirs(STATIC_RUN_DIR)
    .map((dir) => dir.split('/').at(-1))
    .filter(Boolean)
    .sort();
}

function bridgeState(slug) {
  const indexPath = join(STATIC_RUN_DIR, slug, 'index.html');
  if (!existsSync(indexPath)) {
    return { ok: false, reason: 'missing index.html' };
  }

  const html = readText(indexPath);
  const bridgeIndex = html.indexOf('data-shippie-container-local-db');
  const moduleIndex = html.indexOf('<script type="module"');

  if (moduleIndex === -1) return { ok: false, reason: 'missing app module script' };
  if (bridgeIndex === -1) return { ok: false, reason: 'missing local-db bridge' };
  if (bridgeIndex > moduleIndex) return { ok: false, reason: 'local-db bridge loads after app module' };
  return { ok: true };
}

function assetManifestState(slug) {
  const manifestPath = join(STATIC_RUN_DIR, slug, '__shippie-assets.json');
  if (!existsSync(manifestPath)) return { ok: false, reason: 'missing __shippie-assets.json' };

  try {
    const manifest = JSON.parse(readText(manifestPath));
    const runtimePath = `/__shippie-run/${slug}/?shippie_embed=1`;
    if (!Array.isArray(manifest.assets) || !manifest.assets.includes(runtimePath)) {
      return { ok: false, reason: `missing runtime asset ${runtimePath}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'invalid __shippie-assets.json' };
  }
}

function classifySource(appDir) {
  const files = walkFiles(join(appDir, 'src'));
  const body = files.map(readText).join('\n');

  return {
    files,
    usesLocalDb: storagePatterns.localDb.test(body),
    usesLocalStorage: storagePatterns.localStorage.test(body),
    usesIndexedDb: storagePatterns.indexedDb.test(body)
  };
}

function formatList(items) {
  return items.length ? items.join(', ') : 'none';
}

const sourceApps = listDirs(APPS_DIR)
  .filter((dir) => dir.split('/').at(-1)?.startsWith('showcase-'))
  .map((dir) => {
    const slug = sourceSlug(dir);
    return {
      dir,
      slug,
      manifest: readManifest(dir),
      relativeDir: relative(REPO_ROOT, dir),
      storage: classifySource(dir)
    };
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));

const generated = generatedSlugs();
const hosted = staticSlugs();
const generatedSet = new Set(generated);
const hostedSet = new Set(hosted);
const failures = [];
const warnings = [];
const dbBackedHosted = [];
const dbBackedSourceOnly = [];
const directBrowserStorage = [];
const dataInherited = [];

for (const slug of hosted) {
  const bridge = bridgeState(slug);
  if (!bridge.ok) failures.push(`${slug}: ${bridge.reason}`);

  const assets = assetManifestState(slug);
  if (!assets.ok) failures.push(`${slug}: ${assets.reason}`);
}

for (const slug of generated) {
  if (!hostedSet.has(slug)) failures.push(`${slug}: generated catalog entry has no static runtime`);
}

for (const slug of hosted) {
  if (!generatedSet.has(slug)) failures.push(`${slug}: static runtime is missing from generated catalog`);
}

for (const app of sourceApps) {
  const dataPolicy = dataPolicyState(app);
  if (!dataPolicy.ok) failures.push(`${app.slug}: app-data inheritance not enabled (${dataPolicy.detail})`);
  else dataInherited.push(`${app.slug} (${dataPolicy.detail})`);

  const isHosted = hostedSet.has(app.slug);
  if (app.storage.usesLocalDb) {
    if (isHosted) {
      dbBackedHosted.push(app.slug);
      const bridge = bridgeState(app.slug);
      if (!bridge.ok) failures.push(`${app.slug}: DB-backed app is hosted without persistence bridge (${bridge.reason})`);
    } else {
      dbBackedSourceOnly.push(app.slug);
      warnings.push(`${app.slug}: uses shippie.local.db in source but is not currently hosted (${app.relativeDir})`);
    }
  }

  if (app.storage.usesLocalStorage || app.storage.usesIndexedDb) {
    directBrowserStorage.push(app.slug);
  }
}

console.log(`[storage-audit] source showcase apps: ${sourceApps.length}`);
console.log(`[storage-audit] hosted runtimes: ${hosted.length}`);
console.log(`[storage-audit] DB-backed hosted apps: ${formatList(dbBackedHosted)}`);
console.log(`[storage-audit] direct browser-storage apps: ${formatList(directBrowserStorage)}`);
console.log(`[storage-audit] app-data inheritance: ${dataInherited.length} app(s) covered`);

if (dbBackedSourceOnly.length) {
  console.log(`[storage-audit] DB-backed source-only apps: ${formatList(dbBackedSourceOnly)}`);
}

for (const warning of warnings) {
  console.warn(`[storage-audit] warning: ${warning}`);
}

if (failures.length) {
  console.error('[storage-audit] FAIL');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('[storage-audit] PASS: every hosted runtime installs persistence before app code');
