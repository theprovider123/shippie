#!/usr/bin/env bun
/**
 * Build changed showcase apps under apps/showcase-* and copy their dist
 * into apps/platform/static/__shippie-run/<slug>/ so the focused shell can
 * embed them from https://shippie.app/__shippie-run/<slug>/index.html.
 *
 * Wired into apps/platform's `build` script so production deploys
 * auto-include the showcases.
 *
 * Default behaviour is incremental: every static runtime records a source
 * fingerprint in __shippie-assets.json, and later platform-only deploys reuse
 * that runtime instead of rebuilding every app. Use --all for a full bake.
 *
 * Why /run/<slug>/ and not /apps/<slug>/: /apps/<slug> is the
 * marketplace detail page (a SvelteKit dynamic route showing install
 * count, capability badges, etc). /run/<slug>/ is the focused shell
 * users launch; /__shippie-run/<slug>/ is the internal runtime HTML/JS/CSS
 * the container iframes load.
 *
 * Skip behaviour: helper packages under apps/showcase-* that do not
 * declare a shippie.json are ignored. Any directory with a shippie.json
 * is a real app and must have src/main.tsx plus a build script, otherwise
 * the platform build fails before that app silently falls out of launch.
 */

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Shared, pure-module schema. Bun resolves .ts directly; no $lib alias
// or transitive runtime dep is involved (validators are plain TS).
import {
  parseFirstPartyCurationEntry,
  VALID_SURFACES as SHARED_VALID_SURFACES,
  VALID_VISIBILITIES as SHARED_VALID_VISIBILITIES,
  VALID_TIERS as SHARED_VALID_TIERS,
  VALID_CATEGORIES as SHARED_VALID_CATEGORIES,
} from '../src/lib/curation/schema.ts';
import {
  buildArcadeCspMetaTag,
  ARCADE_CSP_INJECTION_MARKER,
  CONTAINER_LOCAL_DB_BRIDGE_SCRIPT,
} from '../src/lib/curation/arcade-csp.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLATFORM_DIR = resolve(__dirname, '..');
const REPO_ROOT = resolve(PLATFORM_DIR, '..', '..');
const APPS_DIR = resolve(REPO_ROOT, 'apps');
const RUNTIME_BASE_PATH = '/__shippie-run';
const STATIC_RUNTIME_DIR = resolve(PLATFORM_DIR, 'static', '__shippie-run');
const CATALOG_OUT = resolve(PLATFORM_DIR, 'src', 'lib', '_generated', 'showcase-catalog.ts');
const PRECACHE_OUT = resolve(PLATFORM_DIR, 'src', 'lib', '_generated', 'precache-list.ts');
const CURATION_OUT = resolve(PLATFORM_DIR, 'src', 'lib', '_generated', 'first-party-curation.ts');
const RUNTIME_PRECACHE_OUT = resolve(PLATFORM_DIR, 'src', 'lib', '_generated', 'runtime-precache.ts');
const SHELL_ASSETS_OUT = resolve(PLATFORM_DIR, 'static', '__shippie-pwa', 'shell-assets.json');

const SOURCE_FINGERPRINT_VERSION = 2;
const SOURCE_SCAN_SKIP_DIRS = new Set([
  '.git',
  '.svelte-kit',
  '.turbo',
  '.vite',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);
const SOURCE_SCAN_SKIP_FILES = new Set(['.DS_Store']);
const SOURCE_SCAN_SKIP_FILE_PATTERNS = [
  /\.d\.ts$/,
  /\.md$/,
  /\.test\.[cm]?[jt]sx?$/,
  /\.spec\.[cm]?[jt]sx?$/,
  /\.tsbuildinfo$/,
];

// Re-derived from the shared schema so this file stays a single
// source of truth — change values in src/lib/curation/schema.ts.
const VALID_SURFACES = new Set(SHARED_VALID_SURFACES);
const VALID_VISIBILITIES = new Set(SHARED_VALID_VISIBILITIES);
const VALID_CATEGORIES = new Set(SHARED_VALID_CATEGORIES);
const WASM_DIR = resolve(PLATFORM_DIR, 'static', '__shippie', 'wasm');
// Keep this in sync with src/lib/container/ai-runtime.ts. Today the
// pinned esm.sh runtime is the working, cacheable source; mirroring it
// onto models.shippie.app is a follow-up hardening step.
const AI_RUNTIME_ASSETS = ['https://esm.sh/@huggingface/transformers@3.0.0'];
const PUBLIC_FLAGSHIP_ORDER = [
  'palate',
  'chiwit',
  'symptom-diary',
  'lift',
  'golazo',
  'tab',
  'receipt-snap',
  'voice-memo',
  'journal',
  'read-later',
  'match-room',
];

const SKIP = new Set([
  'platform',
  'shippie-ai',
]);

function buildSdkRuntime() {
  const sdkDir = join(REPO_ROOT, 'packages', 'sdk');
  console.log('[prepare-showcases] building @shippie/sdk runtime exports...');
  execSync('bun run build', { cwd: sdkDir, stdio: 'inherit' });
}

function parseArgs(argv) {
  const requested = new Set();
  for (const arg of argv) {
    if (arg.startsWith('--slug=')) {
      for (const slug of arg.slice('--slug='.length).split(',')) {
        if (slug.trim()) requested.add(slug.trim());
      }
    }
    if (arg.startsWith('--only=')) {
      for (const slug of arg.slice('--only='.length).split(',')) {
        if (slug.trim()) requested.add(slug.trim());
      }
    }
  }
  return {
    generatedOnly: argv.includes('--generated-only'),
    dryRun: argv.includes('--dry-run'),
    forceAll: argv.includes('--all') || process.env.SHIPPIE_SHOWCASE_BUILD === 'all',
    requested,
  };
}

function listShowcases() {
  const malformed = [];
  const showcases = [];
  for (const name of readdirSync(APPS_DIR)) {
    if (!name.startsWith('showcase-')) continue;
    if (SKIP.has(name)) continue;
    const pkgPath = join(APPS_DIR, name, 'package.json');
    const mainPath = join(APPS_DIR, name, 'src', 'main.tsx');
    const manifestPath = join(APPS_DIR, name, 'shippie.json');
    const hasManifest = existsSync(manifestPath);
    if (!existsSync(pkgPath) || !existsSync(mainPath)) {
      if (hasManifest) malformed.push(`${name} (missing ${!existsSync(pkgPath) ? 'package.json' : 'src/main.tsx'})`);
      continue;
    }
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts?.build) showcases.push(name);
      else if (hasManifest) malformed.push(`${name} (missing package.json scripts.build)`);
    } catch {
      if (hasManifest) malformed.push(`${name} (invalid package.json)`);
    }
  }
  if (malformed.length > 0) {
    throw new Error(`manifest-bearing showcase app(s) are not hostable: ${malformed.join(', ')}`);
  }
  return showcases.sort();
}

function slugFor(showcaseDir) {
  // Prefer the shippie.json slug (the app's own canonical name); fall
  // back to the directory name minus the `showcase-` prefix. This
  // matches what the container's `standaloneUrl: '/run/<slug>'` expects.
  const shippieJsonPath = join(APPS_DIR, showcaseDir, 'shippie.json');
  if (existsSync(shippieJsonPath)) {
    try {
      const cfg = JSON.parse(readFileSync(shippieJsonPath, 'utf8'));
      if (typeof cfg.slug === 'string' && cfg.slug.length > 0) return cfg.slug;
    } catch {
      /* fall through */
    }
  }
  return showcaseDir.replace(/^showcase-/, '');
}

function validateShowcaseLifecycleBoot(showcases) {
  const offenders = [];
  for (const showcaseDir of showcases) {
    const dir = join(APPS_DIR, showcaseDir);
    const mainPath = join(dir, 'src', 'main.tsx');
    if (!existsSync(mainPath)) continue;

    const manifestPath = join(dir, 'shippie.json');
    let manualLifecycle = false;
    if (existsSync(manifestPath)) {
      try {
        const cfg = JSON.parse(readFileSync(manifestPath, 'utf8'));
        manualLifecycle = cfg.lifecycle === 'manual';
      } catch {
        /* invalid manifests are surfaced by the build/audit path */
      }
    }

    if (manualLifecycle) continue;
    const source = readFileSync(mainPath, 'utf8');
    if (!source.includes("@shippie/showcase-kit/boot")) offenders.push(showcaseDir);
  }

  if (offenders.length > 0) {
    throw new Error(
      `showcase lifecycle boot guard failed; import @shippie/showcase-kit/boot or set shippie.json lifecycle=\"manual\": ${offenders.join(', ')}`,
    );
  }
}

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function packageDirForWorkspaceName(name) {
  if (typeof name !== 'string' || !name.startsWith('@shippie/')) return null;
  const dirname = name.slice('@shippie/'.length);
  const dir = join(REPO_ROOT, 'packages', dirname);
  return existsSync(join(dir, 'package.json')) ? dir : null;
}

function dependencyNames(pkg) {
  const names = new Set();
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = pkg?.[field];
    if (!deps || typeof deps !== 'object') continue;
    for (const name of Object.keys(deps)) names.add(name);
  }
  return [...names].sort();
}

function collectWorkspaceDependencyDirs(showcaseDir) {
  const out = [];
  const seen = new Set();
  const queue = [];
  const appPkg = readJsonFile(join(APPS_DIR, showcaseDir, 'package.json'));
  for (const name of dependencyNames(appPkg)) {
    const dir = packageDirForWorkspaceName(name);
    if (dir) queue.push(dir);
  }

  while (queue.length > 0) {
    const dir = queue.shift();
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    out.push(dir);
    const pkg = readJsonFile(join(dir, 'package.json'));
    for (const name of dependencyNames(pkg)) {
      const depDir = packageDirForWorkspaceName(name);
      if (depDir && !seen.has(depDir)) queue.push(depDir);
    }
  }

  return out.sort();
}

function listSourceFiles(dir, prefix = '') {
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (SOURCE_SCAN_SKIP_FILES.has(entry.name)) continue;
    if (SOURCE_SCAN_SKIP_FILE_PATTERNS.some((pattern) => pattern.test(entry.name))) continue;
    const child = join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SOURCE_SCAN_SKIP_DIRS.has(entry.name)) continue;
      out.push(...listSourceFiles(child, rel));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

function addDirectoryToFingerprint(hash, dir, label) {
  if (!existsSync(dir)) return;
  for (const rel of listSourceFiles(dir)) {
    const path = join(dir, rel);
    const bytes = readFileSync(path);
    hash.update(`${label}/${rel}\0${bytes.byteLength}\0`);
    hash.update(bytes);
    hash.update('\0');
  }
}

function computeSourceFingerprint(showcaseDir) {
  const hash = createHash('sha256');
  hash.update(`prepare-showcases-source-v${SOURCE_FINGERPRINT_VERSION}\n`);
  hash.update(`runtime-base=${RUNTIME_BASE_PATH}\n`);
  hash.update(`showcase=${showcaseDir}\n`);
  addDirectoryToFingerprint(hash, join(APPS_DIR, showcaseDir), `apps/${showcaseDir}`);
  for (const dir of collectWorkspaceDependencyDirs(showcaseDir)) {
    addDirectoryToFingerprint(hash, dir, dir.slice(REPO_ROOT.length + 1));
  }
  return `sha256:${hash.digest('hex')}`;
}

function readStaticManifest(slug) {
  const path = join(STATIC_RUNTIME_DIR, slug, '__shippie-assets.json');
  if (!existsSync(path)) return null;
  return readJsonFile(path);
}

function hasStaticRuntime(slug) {
  const dir = join(STATIC_RUNTIME_DIR, slug);
  return existsSync(join(dir, 'index.html')) && existsSync(join(dir, '__shippie-assets.json'));
}

function planShowcaseBuilds(showcases, options) {
  const requested = options.requested;
  const targets = [];
  const skipped = [];
  for (const showcase of showcases) {
    const slug = slugFor(showcase);
    const sourceFingerprint = computeSourceFingerprint(showcase);
    const manifest = readStaticManifest(slug);
    const explicitlyRequested = requested.has(slug) || requested.has(showcase);
    if (requested.size > 0 && !explicitlyRequested) {
      skipped.push({ showcase, slug });
      continue;
    }
    const staticReady = hasStaticRuntime(slug);
    let reason = '';

    if (options.forceAll) reason = 'full rebuild requested';
    else if (explicitlyRequested) reason = 'requested';
    else if (!staticReady) reason = 'missing static runtime';
    else if (manifest?.sourceFingerprint !== sourceFingerprint) {
      reason = manifest?.sourceFingerprint ? 'source changed' : 'missing source fingerprint';
    }

    if (reason) {
      targets.push({ showcase, slug, sourceFingerprint, reason });
    } else {
      skipped.push({ showcase, slug });
    }
  }

  return { targets, skipped };
}

function logBuildPlan(showcases, plan, options) {
  const requestedNote = options.requested.size > 0 ? `, requested=${[...options.requested].join(',')}` : '';
  if (plan.targets.length === 0) {
    console.log(
      `[prepare-showcases] all ${showcases.length} runtime bake(s) are current; skipping showcase builds${requestedNote}.`,
    );
    return;
  }
  const label = options.dryRun ? 'would rebuild' : 'rebuilding';
  console.log(
    `[prepare-showcases] ${label} ${plan.targets.length}/${showcases.length} showcase runtime(s)${requestedNote}:`,
  );
  for (const target of plan.targets) {
    console.log(`  - ${target.showcase} (${target.slug}): ${target.reason}`);
  }
  if (plan.skipped.length > 0) {
    console.log(`[prepare-showcases] reusing ${plan.skipped.length} unchanged runtime bake(s).`);
  }
}

function buildOne(showcaseDir, slug) {
  const dir = join(APPS_DIR, showcaseDir);
  console.log(`[prepare-showcases] building ${showcaseDir} with base=${RUNTIME_BASE_PATH}/${slug}/…`);
  // --base rewrites every root-relative asset path (script src, link href,
  // img src…) so the built dist works when served from /__shippie-run/<slug>/.
  // Dev mode (vite dev) ignores this — devUrl on localhost stays at root.
  execSync(`bunx vite build --base=${RUNTIME_BASE_PATH}/${slug}/`, { cwd: dir, stdio: 'inherit' });
  const distDir = join(dir, 'dist');
  if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
    throw new Error(`${showcaseDir}: build finished but dist/ not found`);
  }
  return distDir;
}

function copyDist(distDir, slug, sourceFingerprint) {
  const target = join(STATIC_RUNTIME_DIR, slug);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(distDir, target, { recursive: true });
  // Strip wa-sqlite WASM blobs from each showcase's static copy. The
  // platform serves a single canonical copy at /__shippie/wasm/wa-sqlite/
  // and @shippie/local-db's runtime locateFile override fetches from
  // there on prod origins, so per-showcase copies are dead bytes that
  // also defeat cross-app HTTP caching. Saves ~1.65 MB per showcase
  // that imports local-db, and removes orphaned WASM from showcases
  // whose JS doesn't reference it (e.g. live-room, whiteboard) at all.
  const stripped = stripWaSqliteAssets(target);
  if (stripped > 0) {
    console.log(
      `[prepare-showcases] stripped ${stripped} wa-sqlite asset(s) from static/__shippie-run/${slug}/assets — served from /__shippie/wasm/wa-sqlite/`,
    );
  }
  injectContainerLocalDbBridge(target, slug);
  // Arcade-purity: enforce the same CSP at bake time as the runtime
  // hooks.server.ts header sets. This is defence-in-depth so the
  // browser still applies the policy when the bundle is opened
  // offline / via direct file:// / in dev. The injection is keyed off
  // the per-showcase shippie.json#curation.surface so non-arcade
  // bakes are untouched.
  injectArcadeCspIfArcade(target, slug);
  stripAppManifestLinks(target, slug);
  stripExternalFontReferences(target, slug);
  ensureFaviconLink(target, slug);
  ensureMetaDescription(target, slug);
  // Emit __shippie-assets.json — the per-showcase asset manifest the
  // marketplace SW reads when the user taps "Save for offline." Walks
  // the post-strip tree so wa-sqlite WASM is correctly excluded; the
  // shared WASM is listed separately in shell-assets.json (warmed once
  // on first download). buildId is a stable hash of the asset list +
  // sizes so future deploys can detect "your saved app is out of date."
  writeAssetManifest(target, slug, sourceFingerprint);
  console.log(`[prepare-showcases] copied ${slug} → static/__shippie-run/${slug}/`);
}

function readShowcaseSurface(slug) {
  // Look for the source shippie.json for this slug — we walk the apps
  // dir because the showcase's source dir name doesn't always match
  // the slug exactly. Returns the curation.surface or null.
  for (const dir of readdirSync(APPS_DIR)) {
    if (!dir.startsWith('showcase-')) continue;
    const path = join(APPS_DIR, dir, 'shippie.json');
    if (!existsSync(path)) continue;
    try {
      const cfg = JSON.parse(readFileSync(path, 'utf8'));
      if ((cfg.slug ?? dir.replace(/^showcase-/, '')) === slug) {
        return cfg?.curation?.surface ?? null;
      }
    } catch {
      /* ignore malformed and try next */
    }
  }
  return null;
}

function injectArcadeCspIfArcade(targetDir, slug) {
  const surface = readShowcaseSurface(slug);
  if (surface !== 'arcade') return;
  const indexPath = join(targetDir, 'index.html');
  if (!existsSync(indexPath)) return;
  const html = readFileSync(indexPath, 'utf8');
  if (html.includes(ARCADE_CSP_INJECTION_MARKER)) return; // idempotent
  const meta = `${ARCADE_CSP_INJECTION_MARKER}${buildArcadeCspMetaTag()}`;
  // Inject as the FIRST element in <head> so the browser sees the CSP
  // before any script tag (CSP applies to the entire document, but
  // putting it first matches every reference example out there and
  // sidesteps Safari edge cases with mid-head policy mutations).
  const next = /<head[\s>]/i.test(html)
    ? html.replace(/<head([^>]*)>/i, `<head$1>${meta}`)
    : `${meta}${html}`;
  writeFileSync(indexPath, next);
}

function injectContainerLocalDbBridge(targetDir, slug) {
  const indexPath = join(targetDir, 'index.html');
  if (!existsSync(indexPath)) return;
  const html = readFileSync(indexPath, 'utf8');
  if (html.includes('data-shippie-container-local-db')) return;
  const script = runtimeLocalBridgeScript(`app_${slug.replace(/-/g, '_')}`);
  const nextHtml = /<head[\s>]/i.test(html)
    ? html.replace(/<head([^>]*)>/i, `<head$1>${script}`)
    : html.replace(/<script/i, `${script}<script`);
  writeFileSync(indexPath, nextHtml);
}

/**
 * Bake-time favicon backstop. ~36 of 66 showcases historically shipped
 * index.html files without a <link rel="icon">, which meant tabs and
 * the wrapper render with no brand icon. Each app's vite config is the
 * right home for its own icon, but the bake should never silently
 * deploy a faviconless surface — so we inject a fallback at prepare
 * time when the app didn't set one. Prefers a co-located icon file
 * (icon.svg / favicon.svg / icon-192.png / favicon.ico) before falling
 * back to the platform Shippie mark at /__shippie-pwa/icon.svg.
 */
function ensureFaviconLink(targetDir, slug) {
  const indexPath = join(targetDir, 'index.html');
  if (!existsSync(indexPath)) return;
  const html = readFileSync(indexPath, 'utf8');
  if (/<link\b[^>]*\brel=["'](?:shortcut\s+)?icon["']/i.test(html)) return;
  if (/<link\b[^>]*\brel=["']apple-touch-icon["']/i.test(html)) return;
  if (!/<\/head>/i.test(html)) return;
  const candidates = ['icon.svg', 'favicon.svg', 'icon-192.png', 'favicon.ico'];
  let href = '/__shippie-pwa/icon.svg';
  for (const f of candidates) {
    if (existsSync(join(targetDir, f))) {
      href = `${RUNTIME_BASE_PATH}/${slug}/${f}`;
      break;
    }
  }
  const type = href.endsWith('.svg') ? ' type="image/svg+xml"' : '';
  const link = `<link rel="icon" href="${href}"${type} />`;
  const next = html.replace(/<\/head>/i, `    ${link}\n  </head>`);
  writeFileSync(indexPath, next);
  console.log(`[prepare-showcases] injected favicon backstop into ${slug}`);
}

/**
 * Bake-time meta-description backstop. Showcases without a description
 * meta tag render bare in social previews, search snippets, and PWA
 * onboarding screens. Source of truth is shippie.json#description; the
 * showcase's own index.html overrides it when present.
 */
function ensureMetaDescription(targetDir, slug) {
  const indexPath = join(targetDir, 'index.html');
  if (!existsSync(indexPath)) return;
  const html = readFileSync(indexPath, 'utf8');
  if (/<meta\s+name=["']description["']/i.test(html)) return;
  if (!/<\/head>/i.test(html)) return;
  // Look up the description from the source showcase's shippie.json.
  let desc = '';
  for (const dir of readdirSync(APPS_DIR)) {
    if (!dir.startsWith('showcase-')) continue;
    const path = join(APPS_DIR, dir, 'shippie.json');
    if (!existsSync(path)) continue;
    try {
      const cfg = JSON.parse(readFileSync(path, 'utf8'));
      if ((cfg.slug ?? dir.replace(/^showcase-/, '')) === slug && typeof cfg.description === 'string') {
        desc = cfg.description.trim();
        break;
      }
    } catch { /* ignore malformed and try next */ }
  }
  if (!desc) return;
  const tag = `<meta name="description" content="${desc.replace(/"/g, '&quot;')}" />`;
  const next = html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
  writeFileSync(indexPath, next);
  console.log(`[prepare-showcases] injected description backstop into ${slug}`);
}

function stripAppManifestLinks(targetDir, slug) {
  const indexPath = join(targetDir, 'index.html');
  if (!existsSync(indexPath)) return;
  const source = readFileSync(indexPath, 'utf8');
  const next = source.replace(
    /<link\b(?=[^>]*\brel=(["'])[^"']*\bmanifest\b[^"']*\1)[^>]*>\s*/gi,
    '',
  );
  if (next === source) return;
  writeFileSync(indexPath, next);
  console.log(`[prepare-showcases] stripped app manifest link from ${slug}`);
}

function stripExternalFontReferences(targetDir, slug) {
  let changed = 0;
  for (const file of listAssetsRecursive(targetDir)) {
    if (!/\.(?:html|css)$/i.test(file.rel)) continue;
    const path = join(targetDir, file.rel);
    const source = readFileSync(path, 'utf8');
    let next = source
      .replace(/<link\b[^>]*href=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"']*["'][^>]*>\s*/gi, '')
      .replace(/<link\b[^>]*href=["']\/\/fonts\.(?:googleapis|gstatic)\.com[^"']*["'][^>]*>\s*/gi, '')
      .replace(/@font-face\s*{[^}]*fonts\.gstatic\.com[^}]*}\s*/gi, '');
    if (next !== source) {
      writeFileSync(path, next);
      changed += 1;
    }
  }
  if (changed > 0) {
    console.log(`[prepare-showcases] stripped external Google font references from ${slug} (${changed} file(s))`);
  }
}

function runtimeLocalBridgeScript(appId) {
  return `<script data-shippie-container-local-db data-app-id="${escapeHtmlAttr(appId)}">${CONTAINER_LOCAL_DB_BRIDGE_SCRIPT}</script>`;
}

function escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function listAssetsRecursive(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...listAssetsRecursive(child, rel));
    } else if (entry.isFile()) {
      out.push({ rel, size: statSync(child).size });
    }
  }
  return out;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  return `{${Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function writeAssetManifest(targetDir, slug, sourceFingerprint) {
  // Skip the manifest file itself — emit AFTER the walk so it never
  // self-references, but the safety belt below also filters it out in
  // case a previous run left one behind.
  const MANIFEST_NAME = '__shippie-assets.json';
  const files = listAssetsRecursive(targetDir).filter((f) => f.rel !== MANIFEST_NAME);
  // Sort by path so the buildId hash is order-stable across runs.
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const entries = files.map((f) => {
    const bytes = readFileSync(join(targetDir, f.rel));
    const url =
      f.rel === 'index.html'
        ? `${RUNTIME_BASE_PATH}/${slug}/?shippie_embed=1`
        : `${RUNTIME_BASE_PATH}/${slug}/${f.rel}`;
    return {
      url,
      size: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  });
  const totalBytes = entries.reduce((sum, f) => sum + f.size, 0);
  const hash = createHash('sha256');
  for (const entry of entries) hash.update(`${entry.url}:${entry.size}:${entry.sha256}\n`);
  const buildId = hash.digest('hex').slice(0, 16);
  const entryUrl = `${RUNTIME_BASE_PATH}/${slug}/?shippie_embed=1`;
  const hashableManifest = {
    protocolVersion: 1,
    slug,
    version: buildId,
    buildId,
    entryUrl,
    assets: entries,
    totalBytes,
  };
  const manifestHash = createHash('sha256').update(stableStringify(hashableManifest)).digest('hex');
  const manifest = {
    ...hashableManifest,
    manifestHash,
    sourceFingerprint,
    assets: entries.map((entry) => entry.url),
    entries,
  };
  writeFileSync(join(targetDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2) + '\n');
}

function stripWaSqliteAssets(targetDir) {
  const assetsDir = join(targetDir, 'assets');
  if (!existsSync(assetsDir)) return 0;
  let count = 0;
  for (const entry of readdirSync(assetsDir)) {
    if (/^wa-sqlite[\w.-]*\.wasm$/.test(entry)) {
      rmSync(join(assetsDir, entry), { force: true });
      count += 1;
    }
  }
  return count;
}

function pruneStaticRuntime(allowedSlugs) {
  const allowed = new Set(allowedSlugs);
  if (!existsSync(STATIC_RUNTIME_DIR)) return;
  let pruned = 0;
  for (const entry of readdirSync(STATIC_RUNTIME_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (allowed.has(entry.name)) continue;
    rmSync(join(STATIC_RUNTIME_DIR, entry.name), { recursive: true, force: true });
    pruned += 1;
  }
  if (pruned > 0) {
    console.log(`[prepare-showcases] pruned ${pruned} stale static/__shippie-run app(s)`);
  }
}

function collectRuntimeAssets(slugs) {
  // Read each showcase's optional `shippie.json#runtime_assets` array.
  // Heavy assets (Stockfish.wasm, word banks, puzzle PGNs) live here
  // so the platform PWA service worker can precache them on install.
  // Without this, an arcade game that needs a chunky runtime would
  // require an online first visit before working offline — failing the
  // "solo path 100% offline" arcade quality gate.
  //
  // Returns a per-slug map for the JSON manifest + a flat list for
  // the SW install batch. Both are stable-sorted so re-bake output is
  // byte-deterministic.
  const perSlug = {};
  const flat = [];
  for (const slug of [...slugs].sort()) {
    for (const dir of readdirSync(APPS_DIR)) {
      if (!dir.startsWith('showcase-')) continue;
      const path = join(APPS_DIR, dir, 'shippie.json');
      if (!existsSync(path)) continue;
      try {
        const cfg = JSON.parse(readFileSync(path, 'utf8'));
        if ((cfg.slug ?? dir.replace(/^showcase-/, '')) !== slug) continue;
        const declared = Array.isArray(cfg.runtime_assets) ? cfg.runtime_assets : [];
        const urls = declared
          .filter((u) => typeof u === 'string' && u.length > 0)
          .map((u) => (u.startsWith('/') ? u : `${RUNTIME_BASE_PATH}/${slug}/${u}`));
        if (urls.length > 0) {
          perSlug[slug] = urls.slice().sort();
          for (const u of perSlug[slug]) flat.push(u);
        }
        break;
      } catch {
        /* malformed shippie.json — skip */
      }
    }
  }
  flat.sort();
  return { perSlug, flat };
}

function writeRuntimePrecache(slugs) {
  // Generated inventory of optional heavy runtime assets. The platform
  // no longer precaches these on service-worker install; saved capsules
  // and first opens cache only the assets the user actually chooses.
  const { flat } = collectRuntimeAssets(slugs);
  mkdirSync(dirname(RUNTIME_PRECACHE_OUT), { recursive: true });
  const body =
    `// Generated by scripts/prepare-showcases.mjs. Do not edit by hand.\n` +
    `//\n` +
    `// Heavy runtime assets sourced from each showcase's\n` +
    `// shippie.json#runtime_assets array. Empty unless at least one\n` +
    `// showcase declares heavy assets (Stockfish, word banks, etc.).\n` +
    `// The PWA service worker reads these lazily through saved capsules,\n` +
    `// not as an install-time bulk cache.\n\n` +
    `export const RUNTIME_PRECACHE: readonly string[] = ${JSON.stringify(flat, null, 2)};\n`;
  writeFileSync(RUNTIME_PRECACHE_OUT, body);
  console.log(`[prepare-showcases] wrote ${RUNTIME_PRECACHE_OUT} (${flat.length} runtime asset(s))`);
}

function writeShellAssets(slugs) {
  // Emit the shared-platform asset manifest the marketplace SW reads
  // when it warms the platform shell on the user's first DOWNLOAD_APP
  // tap. Three parts:
  //   - wasm: shared /__shippie/wasm/* binaries (currently wa-sqlite),
  //     warmed once and cached durably across deploys (the SW's
  //     migration allowlist whitelists /__shippie/wasm/).
  //   - routes: shell HTML routes the user navigates through to reach
  //     a saved app — re-warmed on every activation since they
  //     reference the current deploy's hashed chunks. Listed here so
  //     the SW knows what to cache.add() proactively rather than
  //     waiting for the user to visit each route online.
  //   - runtimes: per-arcade-game heavy bundled assets (Stockfish,
  //     word banks, puzzle PGNs). Source: each showcase's
  //     shippie.json#runtime_assets array. These are sealed when a user
  //     saves a tool, not bulk-cached for every PWA install.
  const wasmAssets = [];
  let totalWasmBytes = 0;
  if (existsSync(WASM_DIR)) {
    const files = listAssetsRecursive(WASM_DIR);
    files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
    for (const f of files) {
      wasmAssets.push(`/__shippie/wasm/${f.rel}`);
      totalWasmBytes += f.size;
    }
  }
  const runtimeAssets = collectRuntimeAssets(slugs);
  const manifest = {
    wasm: wasmAssets,
    aiRuntime: AI_RUNTIME_ASSETS,
    routes: ['/dock', '/tools', '/you', '/'],
    runtimes: runtimeAssets.perSlug,
    totalWasmBytes,
  };
  mkdirSync(dirname(SHELL_ASSETS_OUT), { recursive: true });
  writeFileSync(SHELL_ASSETS_OUT, JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    `[prepare-showcases] wrote ${SHELL_ASSETS_OUT} (${wasmAssets.length} wasm + ${manifest.aiRuntime.length} AI runtime + ${manifest.routes.length} routes)`,
  );
}

function writeShowcaseCatalog(slugs) {
  // Emit the slug list for catalogue/runtime lookup. SHOWCASE_PRECACHE
  // is intentionally empty: the marketplace SW now caches showcase
  // entry HTML on first open or explicit Save, rather than warming
  // every tool on install.
  mkdirSync(dirname(CATALOG_OUT), { recursive: true });
  const body =
    `// Generated by scripts/prepare-showcases.mjs.\n` +
    `// Re-run \`bun scripts/prepare-showcases.mjs\` (or \`bun run build\`)\n` +
    `// to refresh from the showcase set under apps/showcase-*.\n\n` +
    `export const SHOWCASE_SLUGS = ${JSON.stringify([...slugs].sort(), null, 2)} as const;\n\n` +
    `export const SHOWCASE_PRECACHE: readonly string[] = [];\n`;
  writeFileSync(CATALOG_OUT, body);
  console.log(`[prepare-showcases] wrote ${CATALOG_OUT} (${slugs.length} slugs)`);
}

/**
 * Read each successfully-built showcase's shippie.json `curation` block,
 * validate it, and emit the typed first-party curation manifest.
 *
 * Validation rules (fail the build on violation — orphan aliases or
 * unknown surfaces would silently break the marketplace later):
 *   - `surface` must be one of VALID_SURFACES
 *   - top-level `visibility` must be one of VALID_VISIBILITIES
 *   - `category` must be one of VALID_CATEGORIES
 *   - `tier` must be one of VALID_TIERS
 *   - `successor`, when set, must reference a slug in the built set
 *     (so we never alias to a target that doesn't exist in the bake)
 */
function writeFirstPartyCuration(slugs) {
  const built = new Set(slugs);
  const entries = [];
  const errors = [];

  for (const slug of [...slugs].sort()) {
    let cfg = null;
    for (const dir of readdirSync(APPS_DIR)) {
      if (!dir.startsWith('showcase-')) continue;
      const path = join(APPS_DIR, dir, 'shippie.json');
      if (!existsSync(path)) continue;
      try {
        const candidate = JSON.parse(readFileSync(path, 'utf8'));
        if ((candidate.slug ?? dir.replace(/^showcase-/, '')) === slug) {
          cfg = candidate;
          break;
        }
      } catch {
        /* skip malformed */
      }
    }
    if (!cfg) {
      errors.push(`${slug}: shippie.json not found (built but unsourced)`);
      continue;
    }
    const visibility = cfg.visibility;
    if (typeof visibility !== 'string' || !VALID_VISIBILITIES.has(visibility)) {
      errors.push(
        `${slug}: visibility=${JSON.stringify(visibility)} (must be one of ${SHARED_VALID_VISIBILITIES.join(', ')})`,
      );
      continue;
    }
    const curation = cfg.curation;
    if (!curation || typeof curation !== 'object') {
      errors.push(`${slug}: missing 'curation' block in shippie.json`);
      continue;
    }
    const parsed = parseFirstPartyCurationEntry(curation, {
      successorMustExist: (target) => built.has(target),
    });
    if (!parsed.ok) {
      for (const e of parsed.errors) errors.push(`${slug}: ${e}`);
      continue;
    }
    if (visibility !== 'public' && parsed.value.surface === 'featured') {
      errors.push(`${slug}: private/unlisted/team/local apps must not use curation.surface="featured"`);
      continue;
    }
    entries.push({ slug, visibility, ...parsed.value });
  }

  if (errors.length > 0) {
    console.error(`[prepare-showcases] curation validation failed:\n  - ${errors.join('\n  - ')}`);
    throw new Error(`first-party-curation validation failed (${errors.length} error${errors.length === 1 ? '' : 's'})`);
  }

  mkdirSync(dirname(CURATION_OUT), { recursive: true });
  // Group arcade entries by subcategory for the SHELVES manifest used
  // by /arcade/+page.svelte. Entries without subcategory land in the
  // 'other' bucket so the landing surface still has a place for them.
  const SHELF_ORDER = ['daily-brain', 'arcade-cabinet', 'room', 'strategy'];
  const SHELF_LABELS = {
    'daily-brain': { title: 'Daily Brain', subtitle: 'One puzzle a day. Beat your streak.' },
    'arcade-cabinet': { title: 'Arcade Cabinet', subtitle: 'Quarters-on-the-machine. Reflexes + flow.' },
    'room': { title: 'Room Games', subtitle: 'Two-plus phones in the same room.' },
    'strategy': { title: 'Strategy', subtitle: 'Long-form. Think it through.' },
  };
  const shelves = SHELF_ORDER.map((key) => ({
    key,
    title: SHELF_LABELS[key].title,
    subtitle: SHELF_LABELS[key].subtitle,
    slugs: entries
      .filter((e) => e.surface === 'arcade' && e.subcategory === key)
      .map((e) => e.slug)
      .sort(),
  }));
  const flagshipRank = new Map(PUBLIC_FLAGSHIP_ORDER.map((slug, index) => [slug, index]));
  const publicFlagshipSlugs = entries
    .filter((e) => e.visibility === 'public' && e.surface === 'featured' && e.tier === 'public-flagship')
    .map((e) => e.slug)
    .sort((a, b) => {
      const rankA = flagshipRank.get(a) ?? Number.MAX_SAFE_INTEGER;
      const rankB = flagshipRank.get(b) ?? Number.MAX_SAFE_INTEGER;
      return rankA - rankB || a.localeCompare(b);
    });

  const body =
    `// Generated by scripts/prepare-showcases.mjs. Do not edit by hand.\n` +
    `// Re-run \`bun scripts/prepare-showcases.mjs\` to refresh from each\n` +
    `// showcase's shippie.json#curation block.\n` +
    `//\n` +
    `// surface: 'featured' | 'arcade' | 'labs' | 'archived'\n` +
    `// visibility: ${SHARED_VALID_VISIBILITIES.map((v) => `'${v}'`).join(' | ')}\n` +
    `// tier: ${SHARED_VALID_TIERS.map((t) => `'${t}'`).join(' | ')}\n` +
    `// category: ${SHARED_VALID_CATEGORIES.map((c) => `'${c}'`).join(' | ')}\n` +
    `// subcategory: 'daily-brain' | 'arcade-cabinet' | 'room' | 'strategy' (optional)\n` +
    `// successor: alias target — only set when the named slug is in the current bake\n\n` +
    `export type CurationSurface = 'featured' | 'arcade' | 'labs' | 'archived';\n` +
    `export type CurationVisibility = ${SHARED_VALID_VISIBILITIES.map((v) => `'${v}'`).join(' | ')};\n` +
    `export type CurationTier = ${SHARED_VALID_TIERS.map((t) => `'${t}'`).join(' | ')};\n` +
    `export type CurationCategory = ${SHARED_VALID_CATEGORIES.map((c) => `'${c}'`).join(' | ')};\n` +
    `export type CurationSubcategory = 'daily-brain' | 'arcade-cabinet' | 'room' | 'strategy';\n\n` +
    `export interface CurationEntry {\n` +
    `  slug: string;\n` +
    `  surface: CurationSurface;\n` +
    `  visibility: CurationVisibility;\n` +
    `  tier: CurationTier;\n` +
    `  category: CurationCategory;\n` +
    `  subcategory?: CurationSubcategory;\n` +
    `  successor?: string;\n` +
    `}\n\n` +
    `export interface ArcadeShelf {\n` +
    `  key: CurationSubcategory;\n` +
    `  title: string;\n` +
    `  subtitle: string;\n` +
    `  slugs: readonly string[];\n` +
    `}\n\n` +
    `export const FIRST_PARTY_CURATION: readonly CurationEntry[] = ${JSON.stringify(entries, null, 2)} as const;\n\n` +
    `export const PUBLIC_FLAGSHIP_SLUGS: readonly string[] = ${JSON.stringify(publicFlagshipSlugs, null, 2)} as const;\n\n` +
    `export const SHELVES: readonly ArcadeShelf[] = ${JSON.stringify(shelves, null, 2)} as const;\n\n` +
    `const BY_SLUG = new Map(FIRST_PARTY_CURATION.map((e) => [e.slug, e]));\n\n` +
    `export function curationFor(slug: string): CurationEntry | undefined {\n` +
    `  return BY_SLUG.get(slug);\n` +
    `}\n\n` +
    `export function showcasesBySurface(surface: CurationSurface): readonly CurationEntry[] {\n` +
    `  return FIRST_PARTY_CURATION.filter((e) => e.surface === surface);\n` +
    `}\n\n` +
    `export function publicShowcasesBySurface(surface: CurationSurface): readonly CurationEntry[] {\n` +
    `  return FIRST_PARTY_CURATION.filter((e) => e.visibility === 'public' && e.surface === surface);\n` +
    `}\n\n` +
    `export function showcasesByTier(tier: CurationTier): readonly CurationEntry[] {\n` +
    `  return FIRST_PARTY_CURATION.filter((e) => e.tier === tier);\n` +
    `}\n\n` +
    `export function showcasesByVisibility(visibility: CurationVisibility): readonly CurationEntry[] {\n` +
    `  return FIRST_PARTY_CURATION.filter((e) => e.visibility === visibility);\n` +
    `}\n`;
  writeFileSync(CURATION_OUT, body);
  console.log(`[prepare-showcases] wrote ${CURATION_OUT} (${entries.length} entries)`);
}

function writePrecacheList() {
  // Compatibility shim for imports that predate showcase-catalog.ts.
  mkdirSync(dirname(PRECACHE_OUT), { recursive: true });
  const body =
    `// Generated by scripts/prepare-showcases.mjs.\n` +
    `// Compatibility re-export for older imports; the generated showcase\n` +
    `// catalog is the single source of truth.\n` +
    `export { SHOWCASE_PRECACHE } from './showcase-catalog';\n`;
  writeFileSync(PRECACHE_OUT, body);
  console.log(`[prepare-showcases] wrote ${PRECACHE_OUT} (re-export)`);
}

function slugsWithStaticRuntime(slugs) {
  return slugs.filter((slug) => {
    const dir = join(STATIC_RUNTIME_DIR, slug);
    return existsSync(join(dir, 'index.html')) && existsSync(join(dir, '__shippie-assets.json'));
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const showcases = listShowcases();
  if (showcases.length === 0) {
    console.log('[prepare-showcases] no showcase-* apps found.');
    writeShowcaseCatalog([]);
    writePrecacheList();
    writeRuntimePrecache([]);
    if (!options.generatedOnly) writeShellAssets([]);
    return;
  }
  validateShowcaseLifecycleBoot(showcases);
  if (options.generatedOnly) {
    const slugs = showcases.map((showcase) => slugFor(showcase));
    const hostedSlugs = slugsWithStaticRuntime(slugs);
    const missing = slugs.filter((slug) => !hostedSlugs.includes(slug));
    if (missing.length > 0) {
      console.warn(
        `[prepare-showcases] generated-only: ${missing.length} showcase(s) have no static bake; runtime asset manifests only include hosted runtimes: ${missing.join(', ')}`,
      );
    }
    writeShowcaseCatalog(slugs);
    writeFirstPartyCuration(slugs);
    writeRuntimePrecache(hostedSlugs);
    writePrecacheList();
    console.log(
      `[prepare-showcases] generated manifests only for ${slugs.length} showcase(s) (${hostedSlugs.length} hosted runtime(s)).`,
    );
    return;
  }

  const slugs = showcases.map((showcase) => slugFor(showcase));
  const plan = planShowcaseBuilds(showcases, options);
  logBuildPlan(showcases, plan, options);
  if (options.dryRun) return;

  mkdirSync(STATIC_RUNTIME_DIR, { recursive: true });
  const failures = [];
  if (plan.targets.length > 0) buildSdkRuntime();
  for (const target of plan.targets) {
    try {
      const distDir = buildOne(target.showcase, target.slug);
      copyDist(distDir, target.slug, target.sourceFingerprint);
    } catch (err) {
      console.warn(`[prepare-showcases] ${target.showcase} failed: ${err.message}`);
      failures.push(target.showcase);
    }
  }
  if (failures.length > 0) {
    throw new Error(`showcase runtime build failed: ${failures.join(', ')}`);
  }

  pruneStaticRuntime(slugs);
  const hostedSlugs = slugsWithStaticRuntime(slugs);
  const missingHosted = slugs.filter((slug) => !hostedSlugs.includes(slug));
  if (missingHosted.length > 0) {
    throw new Error(`static runtime missing after prepare: ${missingHosted.join(', ')}`);
  }
  writeShowcaseCatalog(hostedSlugs);
  writeFirstPartyCuration(hostedSlugs);
  writeRuntimePrecache(hostedSlugs);
  writePrecacheList();
  writeShellAssets(hostedSlugs);
  console.log(
    `[prepare-showcases] done. ${hostedSlugs.length}/${showcases.length} showcases hosted under ${RUNTIME_BASE_PATH}/<slug>/index.html.`,
  );
}

main();
