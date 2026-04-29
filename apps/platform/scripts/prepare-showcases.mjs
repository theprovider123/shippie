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
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLATFORM_DIR = resolve(__dirname, '..');
const REPO_ROOT = resolve(PLATFORM_DIR, '..', '..');
const APPS_DIR = resolve(REPO_ROOT, 'apps');
const STATIC_RUN_DIR = resolve(PLATFORM_DIR, 'static', 'run');

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

function buildOne(showcaseDir) {
  const dir = join(APPS_DIR, showcaseDir);
  console.log(`[prepare-showcases] building ${showcaseDir}…`);
  execSync('bun run build', { cwd: dir, stdio: 'inherit' });
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
  console.log(`[prepare-showcases] copied ${slug} → static/run/${slug}/`);
}

function main() {
  mkdirSync(STATIC_RUN_DIR, { recursive: true });
  const showcases = listShowcases();
  if (showcases.length === 0) {
    console.log('[prepare-showcases] no showcase-* apps found.');
    return;
  }
  const failures = [];
  for (const showcase of showcases) {
    try {
      const distDir = buildOne(showcase);
      copyDist(distDir, slugFor(showcase));
    } catch (err) {
      console.warn(`[prepare-showcases] ${showcase} failed: ${err.message}`);
      failures.push(showcase);
    }
  }
  console.log(
    `[prepare-showcases] done. ${showcases.length - failures.length}/${showcases.length} showcases hosted at /run/<slug>/.`,
  );
  if (failures.length > 0) {
    console.warn(`[prepare-showcases] failed: ${failures.join(', ')}`);
  }
}

main();
