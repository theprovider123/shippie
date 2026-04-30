#!/usr/bin/env bun
/**
 * Build every showcase app under apps/showcase-* and copy its dist
 * into apps/platform/static/run/<slug>/ so the SvelteKit Cloudflare
 * adapter serves them at https://shippie.app/run/<slug>/.
 *
 * Wired into apps/platform's `build` script so production deploys
 * auto-include the showcases.
 *
 * Why /run/<slug>/ and not /apps/<slug>/: /apps/<slug> is the
 * marketplace detail page (a SvelteKit dynamic route showing install
 * count, capability badges, etc). /run/<slug>/ is the runtime
 * surface — the actual app HTML/JS/CSS the container iframes load.
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLATFORM_DIR = resolve(__dirname, '..');
const REPO_ROOT = resolve(PLATFORM_DIR, '..', '..');
const APPS_DIR = resolve(REPO_ROOT, 'apps');
const STATIC_RUN_DIR = resolve(PLATFORM_DIR, 'static', 'run');
const PRECACHE_OUT = resolve(PLATFORM_DIR, 'src', 'lib', '_generated', 'precache-list.ts');
const SHELL_ASSETS_OUT = resolve(PLATFORM_DIR, 'static', '__shippie-pwa', 'shell-assets.json');
const WASM_DIR = resolve(PLATFORM_DIR, 'static', '__shippie', 'wasm');

const SKIP = new Set(['platform', 'shippie-ai']);

function listShowcases() {
  return readdirSync(APPS_DIR).filter((name) => {
    if (!name.startsWith('showcase-')) return false;
    if (SKIP.has(name)) return false;
    const pkgPath = join(APPS_DIR, name, 'package.json');
    if (!existsSync(pkgPath)) return false;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      return Boolean(pkg.scripts?.build);
    } catch {
      return false;
    }
  });
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

function buildOne(showcaseDir, slug) {
  const dir = join(APPS_DIR, showcaseDir);
  console.log(`[prepare-showcases] building ${showcaseDir} with base=/run/${slug}/…`);
  // --base rewrites every root-relative asset path (script src, link href,
  // img src…) so the built dist works when served from /run/<slug>/.
  // Dev mode (vite dev) ignores this — devUrl on localhost stays at root.
  execSync(`bunx vite build --base=/run/${slug}/`, { cwd: dir, stdio: 'inherit' });
  const distDir = join(dir, 'dist');
  if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
    throw new Error(`${showcaseDir}: build finished but dist/ not found`);
  }
  return distDir;
}

function copyDist(distDir, slug) {
  const target = join(STATIC_RUN_DIR, slug);
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
      `[prepare-showcases] stripped ${stripped} wa-sqlite asset(s) from static/run/${slug}/assets — served from /__shippie/wasm/wa-sqlite/`,
    );
  }
  // Emit __shippie-assets.json — the per-showcase asset manifest the
  // marketplace SW reads when the user taps "Save for offline." Walks
  // the post-strip tree so wa-sqlite WASM is correctly excluded; the
  // shared WASM is listed separately in shell-assets.json (warmed once
  // on first download). buildId is a stable hash of the asset list +
  // sizes so future deploys can detect "your saved app is out of date."
  writeAssetManifest(target, slug);
  console.log(`[prepare-showcases] copied ${slug} → static/run/${slug}/`);
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

function writeAssetManifest(targetDir, slug) {
  // Skip the manifest file itself — emit AFTER the walk so it never
  // self-references, but the safety belt below also filters it out in
  // case a previous run left one behind.
  const MANIFEST_NAME = '__shippie-assets.json';
  const files = listAssetsRecursive(targetDir).filter((f) => f.rel !== MANIFEST_NAME);
  // Sort by path so the buildId hash is order-stable across runs.
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const hash = createHash('sha256');
  for (const f of files) hash.update(`${f.rel}:${f.size}\n`);
  const buildId = hash.digest('hex').slice(0, 16);
  const manifest = {
    slug,
    buildId,
    totalBytes,
    assets: files.map((f) => `/run/${slug}/${f.rel}`),
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

function writeShellAssets() {
  // Emit the shared-platform asset manifest the marketplace SW reads
  // when it warms the platform shell on the user's first DOWNLOAD_APP
  // tap. Two parts:
  //   - wasm: shared /__shippie/wasm/* binaries (currently wa-sqlite),
  //     warmed once and cached durably across deploys (the SW's
  //     migration allowlist whitelists /__shippie/wasm/).
  //   - routes: shell HTML routes the user navigates through to reach
  //     a saved app — re-warmed on every activation since they
  //     reference the current deploy's hashed chunks. Listed here so
  //     the SW knows what to cache.add() proactively rather than
  //     waiting for the user to visit each route online.
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
  const manifest = {
    wasm: wasmAssets,
    routes: ['/', '/apps'],
    totalWasmBytes,
  };
  mkdirSync(dirname(SHELL_ASSETS_OUT), { recursive: true });
  writeFileSync(SHELL_ASSETS_OUT, JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    `[prepare-showcases] wrote ${SHELL_ASSETS_OUT} (${wasmAssets.length} wasm + ${manifest.routes.length} routes)`,
  );
}

function writePrecacheList(slugs) {
  // Emit the slug list the marketplace SW reads on `install` to warm
  // the cache with showcase entry HTMLs. Per-app assets cache on first
  // request via the SW's stale-while-revalidate handler — this list
  // covers only the entry HTML so the SW install doesn't pull MBs
  // before the user touches anything.
  mkdirSync(dirname(PRECACHE_OUT), { recursive: true });
  const entries = slugs.flatMap((slug) => [`/run/${slug}/`, `/run/${slug}/index.html`]);
  const body =
    `// Generated by scripts/prepare-showcases.mjs.\n` +
    `// Re-run \`bun scripts/prepare-showcases.mjs\` (or \`bun run build\`)\n` +
    `// to refresh from the showcase set under apps/showcase-*.\n\n` +
    `export const SHOWCASE_PRECACHE: readonly string[] = ${JSON.stringify(entries, null, 2)};\n`;
  writeFileSync(PRECACHE_OUT, body);
  console.log(`[prepare-showcases] wrote ${PRECACHE_OUT} (${entries.length} entries)`);
}

function main() {
  mkdirSync(STATIC_RUN_DIR, { recursive: true });
  const showcases = listShowcases();
  if (showcases.length === 0) {
    console.log('[prepare-showcases] no showcase-* apps found.');
    writePrecacheList([]);
    writeShellAssets();
    return;
  }
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
  writePrecacheList(built);
  writeShellAssets();
  console.log(
    `[prepare-showcases] done. ${showcases.length - failures.length}/${showcases.length} showcases hosted at /run/<slug>/.`,
  );
  if (failures.length > 0) {
    console.warn(`[prepare-showcases] failed: ${failures.join(', ')}`);
  }
}

main();
