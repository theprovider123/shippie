#!/usr/bin/env bun
/**
 * Build every showcase app under apps/showcase-* and copy its dist
 * into apps/platform/static/__shippie-run/<slug>/ so the focused shell can
 * embed them from https://shippie.app/__shippie-run/<slug>/index.html.
 *
 * Wired into apps/platform's `build` script so production deploys
 * auto-include the showcases.
 *
 * Why /run/<slug>/ and not /apps/<slug>/: /apps/<slug> is the
 * marketplace detail page (a SvelteKit dynamic route showing install
 * count, capability badges, etc). /run/<slug>/ is the focused shell
 * users launch; /__shippie-run/<slug>/ is the internal runtime HTML/JS/CSS
 * the container iframes load.
 *
 * Skip behaviour: a showcase whose package.json is missing a build
 * script, or whose vite.config.ts won't compile, is logged and
 * skipped — never blocks the platform deploy. Per-showcase failures
 * are visible in the build log so the maker can repair them.
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

// Re-derived from the shared schema so this file stays a single
// source of truth — change values in src/lib/curation/schema.ts.
const VALID_SURFACES = new Set(SHARED_VALID_SURFACES);
const VALID_CATEGORIES = new Set(SHARED_VALID_CATEGORIES);
const WASM_DIR = resolve(PLATFORM_DIR, 'static', '__shippie', 'wasm');
// Keep this in sync with src/lib/container/ai-runtime.ts. Today the
// pinned esm.sh runtime is the working, cacheable source; mirroring it
// onto models.shippie.app is a follow-up hardening step.
const AI_RUNTIME_ASSETS = ['https://esm.sh/@huggingface/transformers@3.0.0'];

const SKIP = new Set(['platform', 'shippie-ai']);

function buildSdkRuntime() {
  const sdkDir = join(REPO_ROOT, 'packages', 'sdk');
  console.log('[prepare-showcases] building @shippie/sdk runtime exports...');
  execSync('bun run build', { cwd: sdkDir, stdio: 'inherit' });
}

function listShowcases() {
  return readdirSync(APPS_DIR).filter((name) => {
    if (!name.startsWith('showcase-')) return false;
    if (SKIP.has(name)) return false;
    const pkgPath = join(APPS_DIR, name, 'package.json');
    const mainPath = join(APPS_DIR, name, 'src', 'main.tsx');
    if (!existsSync(pkgPath)) return false;
    if (!existsSync(mainPath)) return false;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      return Boolean(pkg.scripts?.build);
    } catch {
      return false;
    }
  }).sort();
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

function copyDist(distDir, slug) {
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
  // Emit __shippie-assets.json — the per-showcase asset manifest the
  // marketplace SW reads when the user taps "Save for offline." Walks
  // the post-strip tree so wa-sqlite WASM is correctly excluded; the
  // shared WASM is listed separately in shell-assets.json (warmed once
  // on first download). buildId is a stable hash of the asset list +
  // sizes so future deploys can detect "your saved app is out of date."
  writeAssetManifest(target, slug);
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

function writeAssetManifest(targetDir, slug) {
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
  // Generated module the SW imports for its install-time precache batch.
  // Empty by default — a slug appears here only when its shippie.json
  // declares `runtime_assets`. Keeps the SW install fast for showcases
  // that don't need heavy precache.
  const { flat } = collectRuntimeAssets(slugs);
  mkdirSync(dirname(RUNTIME_PRECACHE_OUT), { recursive: true });
  const body =
    `// Generated by scripts/prepare-showcases.mjs. Do not edit by hand.\n` +
    `//\n` +
    `// Heavy runtime assets to precache during the platform PWA service\n` +
    `// worker install. Sourced from each showcase's\n` +
    `// shippie.json#runtime_assets array. Empty unless at least one\n` +
    `// showcase declares heavy assets (Stockfish, word banks, etc.).\n\n` +
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
  //     shippie.json#runtime_assets array. The SW install handler
  //     precaches these at install time (NOT lazy on first visit) so
  //     "100% offline" claims hold up.
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
    routes: ['/', '/apps'],
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
  // Emit the slug list the marketplace SW reads on `install` to warm
  // the cache with showcase entry HTMLs. Per-app assets cache on first
  // request via the SW's stale-while-revalidate handler — this list
  // covers only the entry HTML so the SW install doesn't pull MBs
  // before the user touches anything.
  mkdirSync(dirname(CATALOG_OUT), { recursive: true });
  const body =
    `// Generated by scripts/prepare-showcases.mjs.\n` +
    `// Re-run \`bun scripts/prepare-showcases.mjs\` (or \`bun run build\`)\n` +
    `// to refresh from the showcase set under apps/showcase-*.\n\n` +
    `export const SHOWCASE_SLUGS = ${JSON.stringify([...slugs].sort(), null, 2)} as const;\n\n` +
    `export const SHOWCASE_PRECACHE: readonly string[] = SHOWCASE_SLUGS.map((slug) => \`${RUNTIME_BASE_PATH}/\${slug}/?shippie_embed=1\`);\n`;
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
 *   - `category` must be one of VALID_CATEGORIES
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
    entries.push({ slug, ...parsed.value });
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

  const body =
    `// Generated by scripts/prepare-showcases.mjs. Do not edit by hand.\n` +
    `// Re-run \`bun scripts/prepare-showcases.mjs\` to refresh from each\n` +
    `// showcase's shippie.json#curation block.\n` +
    `//\n` +
    `// surface: 'featured' | 'arcade' | 'labs' | 'archived'\n` +
    `// category: 'food-drink' | 'health-fitness' | 'social' | 'games' | 'tools' | 'creative'\n` +
    `// subcategory: 'daily-brain' | 'arcade-cabinet' | 'room' | 'strategy' (optional)\n` +
    `// successor: alias target — only set when the named slug is in the current bake\n\n` +
    `export type CurationSurface = 'featured' | 'arcade' | 'labs' | 'archived';\n` +
    `export type CurationCategory = 'food-drink' | 'health-fitness' | 'social' | 'games' | 'tools' | 'creative';\n` +
    `export type CurationSubcategory = 'daily-brain' | 'arcade-cabinet' | 'room' | 'strategy';\n\n` +
    `export interface CurationEntry {\n` +
    `  slug: string;\n` +
    `  surface: CurationSurface;\n` +
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
    `export const SHELVES: readonly ArcadeShelf[] = ${JSON.stringify(shelves, null, 2)} as const;\n\n` +
    `const BY_SLUG = new Map(FIRST_PARTY_CURATION.map((e) => [e.slug, e]));\n\n` +
    `export function curationFor(slug: string): CurationEntry | undefined {\n` +
    `  return BY_SLUG.get(slug);\n` +
    `}\n\n` +
    `export function showcasesBySurface(surface: CurationSurface): readonly CurationEntry[] {\n` +
    `  return FIRST_PARTY_CURATION.filter((e) => e.surface === surface);\n` +
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
  const generatedOnly = process.argv.includes('--generated-only');
  const showcases = listShowcases();
  if (showcases.length === 0) {
    console.log('[prepare-showcases] no showcase-* apps found.');
    writeShowcaseCatalog([]);
    writePrecacheList();
    writeRuntimePrecache([]);
    if (!generatedOnly) writeShellAssets([]);
    return;
  }
  validateShowcaseLifecycleBoot(showcases);
  if (generatedOnly) {
    const slugs = showcases.map((showcase) => slugFor(showcase));
    const hostedSlugs = slugsWithStaticRuntime(slugs);
    const missing = slugs.filter((slug) => !hostedSlugs.includes(slug));
    if (missing.length > 0) {
      console.warn(
        `[prepare-showcases] generated-only: ${missing.length} showcase(s) have no static bake and were excluded from runtime manifests: ${missing.join(', ')}`,
      );
    }
    writeShowcaseCatalog(hostedSlugs);
    writeFirstPartyCuration(hostedSlugs);
    writeRuntimePrecache(hostedSlugs);
    writePrecacheList();
    console.log(
      `[prepare-showcases] generated manifests only for ${hostedSlugs.length} hosted showcase(s).`,
    );
    return;
  }
  buildSdkRuntime();
  mkdirSync(STATIC_RUNTIME_DIR, { recursive: true });
  const failures = [];
  const built = [];
  for (const showcase of showcases) {
    try {
      const slug = slugFor(showcase);
      const distDir = buildOne(showcase, slug);
      copyDist(distDir, slug);
      built.push(slug);
    } catch (err) {
      console.warn(`[prepare-showcases] ${showcase} failed: ${err.message}`);
      failures.push(showcase);
    }
  }
  pruneStaticRuntime(built);
  writeShowcaseCatalog(built);
  writeFirstPartyCuration(built);
  writeRuntimePrecache(built);
  writePrecacheList();
  writeShellAssets(built);
  console.log(
    `[prepare-showcases] done. ${showcases.length - failures.length}/${showcases.length} showcases hosted under ${RUNTIME_BASE_PATH}/<slug>/index.html.`,
  );
  if (failures.length > 0) {
    console.warn(`[prepare-showcases] failed: ${failures.join(', ')}`);
  }
}

main();
