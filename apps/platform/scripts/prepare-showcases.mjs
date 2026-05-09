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

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLATFORM_DIR = resolve(__dirname, '..');
const REPO_ROOT = resolve(PLATFORM_DIR, '..', '..');
const APPS_DIR = resolve(REPO_ROOT, 'apps');
const RUNTIME_BASE_PATH = '/__shippie-run';
const STATIC_RUNTIME_DIR = resolve(PLATFORM_DIR, 'static', '__shippie-run');
const CATALOG_OUT = resolve(PLATFORM_DIR, 'src', 'lib', '_generated', 'showcase-catalog.ts');
const PRECACHE_OUT = resolve(PLATFORM_DIR, 'src', 'lib', '_generated', 'precache-list.ts');
const SHELL_ASSETS_OUT = resolve(PLATFORM_DIR, 'static', '__shippie-pwa', 'shell-assets.json');
const WASM_DIR = resolve(PLATFORM_DIR, 'static', '__shippie', 'wasm');
// Keep this in sync with src/lib/container/ai-runtime.ts. Today the
// pinned esm.sh runtime is the working, cacheable source; mirroring it
// onto models.shippie.app is a follow-up hardening step.
const AI_RUNTIME_ASSETS = ['https://esm.sh/@huggingface/transformers@3.0.0'];

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
  // Emit __shippie-assets.json — the per-showcase asset manifest the
  // marketplace SW reads when the user taps "Save for offline." Walks
  // the post-strip tree so wa-sqlite WASM is correctly excluded; the
  // shared WASM is listed separately in shell-assets.json (warmed once
  // on first download). buildId is a stable hash of the asset list +
  // sizes so future deploys can detect "your saved app is out of date."
  writeAssetManifest(target, slug);
  console.log(`[prepare-showcases] copied ${slug} → static/__shippie-run/${slug}/`);
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

function runtimeLocalBridgeScript(appId) {
  return `<script data-shippie-container-local-db>(function(){var appId=${JSON.stringify(appId)};var protocol='shippie.bridge.v1';var seq=0;var pending=new Map();function request(capability,method,payload){var id='local_db_'+(++seq);return new Promise(function(resolve,reject){var timer=setTimeout(function(){pending.delete(id);reject(new Error('Shippie local DB request timed out.'));},5000);pending.set(id,{resolve:resolve,reject:reject,timer:timer});window.parent.postMessage({protocol:protocol,id:id,appId:appId,capability:capability,method:method,payload:payload},window.location.origin);});}window.addEventListener('message',function(event){if(event.origin!==window.location.origin)return;var data=event.data;if(!data||data.protocol!==protocol||!pending.has(data.id))return;var entry=pending.get(data.id);pending.delete(data.id);clearTimeout(entry.timer);if(data.ok){entry.resolve(data.result);return;}entry.reject(new Error(data.error&&data.error.message?data.error.message:'Shippie local DB request failed.'));});function rows(result){var list=result&&Array.isArray(result.rows)?result.rows:[];return list.map(function(row){return row&&row.payload&&typeof row.payload==='object'?row.payload:row;});}var shippie=window.shippie||{};var local=shippie.local||{};local.db={create:function(table,schema){return request('db.insert','create',{table:table,schema:schema}).then(function(){});},insert:function(table,value){return request('db.insert','insert',{table:table,value:value}).then(function(){});},query:function(table,opts){return request('db.query','query',Object.assign({table:table},opts||{})).then(rows);},search:function(table,query,opts){return request('db.query','search',Object.assign({table:table,query:query},opts||{})).then(rows);},vectorSearch:function(table,vector,opts){var v=Array.prototype.slice.call(vector||[]);return request('db.query','vectorSearch',{table:table,vector:v,opts:opts||{}}).then(function(result){return rows(result).map(function(row,index){var source=result&&result.rows&&result.rows[index];return Object.assign({},row,{score:source&&typeof source.score==='number'?source.score:0});});});},update:function(table,id,patch){return request('db.insert','update',{table:table,id:id,patch:patch}).then(function(){});},delete:function(table,id){return request('db.insert','delete',{table:table,id:id}).then(function(){});},count:function(table,opts){return request('db.query','count',Object.assign({table:table},opts||{})).then(function(result){return result&&typeof result.count==='number'?result.count:0;});},export:function(table,opts){return request('db.query','export',Object.assign({table:table},opts||{})).then(function(result){return new Blob([JSON.stringify(result)],{type:'application/json'});});},restore:function(){return Promise.resolve({createdAt:new Date().toISOString(),appId:appId,schemaVersion:1,encrypted:false});},lastBackup:function(){return request('db.query','lastBackup',{});},usage:function(){return request('storage.getUsage','usage',{}).then(function(result){return {usedBytes:result&&typeof result.bytes==='number'?result.bytes:0,warningLevel:'none',persisted:true};});},requestPersistence:function(){return Promise.resolve(true);}};shippie.local=local;window.shippie=shippie;})();</script>`;
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
    assets: files.map((f) =>
      f.rel === 'index.html'
        ? `${RUNTIME_BASE_PATH}/${slug}/?shippie_embed=1`
        : `${RUNTIME_BASE_PATH}/${slug}/${f.rel}`,
    ),
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
    aiRuntime: AI_RUNTIME_ASSETS,
    routes: ['/', '/apps'],
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

function main() {
  mkdirSync(STATIC_RUNTIME_DIR, { recursive: true });
  const showcases = listShowcases();
  if (showcases.length === 0) {
    console.log('[prepare-showcases] no showcase-* apps found.');
    writeShowcaseCatalog([]);
    writePrecacheList();
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
  pruneStaticRuntime(built);
  writeShowcaseCatalog(built);
  writePrecacheList();
  writeShellAssets();
  console.log(
    `[prepare-showcases] done. ${showcases.length - failures.length}/${showcases.length} showcases hosted under ${RUNTIME_BASE_PATH}/<slug>/index.html.`,
  );
  if (failures.length > 0) {
    console.warn(`[prepare-showcases] failed: ${failures.join(', ')}`);
  }
}

main();
