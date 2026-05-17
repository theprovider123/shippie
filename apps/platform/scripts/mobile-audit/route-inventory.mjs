#!/usr/bin/env bun
/**
 * Mobile-audit route inventory.
 *
 * Walks apps/platform/src/routes/ and enumerates every user-facing
 * page (+page.svelte). Classifies each route into a shell category
 * (public / container / dashboard / admin / auth / onboarding / dev),
 * then emits two artifacts:
 *
 *   1. JSON at apps/platform/scripts/mobile-audit/route-inventory.json
 *   2. Markdown table at docs/launch/2026-05-17-mobile-audit-platform-shell.md
 *      (only the inventory section — the doc owns the rest)
 *
 * Run via:
 *   bun apps/platform/scripts/mobile-audit/route-inventory.mjs
 *
 * Exit code is always 0 unless the script itself crashes. Drift between
 * the inventory and the audit doc is surfaced by audit-static-rules.mjs.
 */
import { readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const ROUTES = join(ROOT, 'apps/platform/src/routes');
const OUT_JSON = join(ROOT, 'apps/platform/scripts/mobile-audit/route-inventory.json');
const OUT_MD = join(ROOT, 'apps/platform/scripts/mobile-audit/route-inventory.md');

/**
 * Convert filesystem path to URL path. Drops SvelteKit grouping segments
 * (folders wrapped in parens) and SvelteKit param matchers like
 * `[atname=atname]` → `[atname]`.
 */
function toUrlPath(relPath) {
  const segments = relPath
    .split('/')
    .filter((seg) => !seg.startsWith('(') || !seg.endsWith(')'))
    .map((seg) => seg.replace(/\[([^=\]]+)=[^\]]+\]/, '[$1]'));
  const url = '/' + segments.join('/');
  return url.replace(/\/+$/, '') || '/';
}

function classifyShell(urlPath) {
  if (urlPath === '/container') return 'container';
  if (urlPath.startsWith('/dashboard')) return 'dashboard';
  if (urlPath.startsWith('/admin')) return 'admin';
  if (urlPath.startsWith('/auth/')) return 'auth';
  if (urlPath === '/new' || urlPath.startsWith('/invite/')) return 'onboarding';
  if (urlPath.startsWith('/dev/')) return 'dev';
  if (urlPath.startsWith('/run/')) return 'showcase-wrapper';
  return 'public';
}

function priorityFor(urlPath, shell) {
  // P0: top traffic + flagship surfaces.
  if (urlPath === '/') return 'P0';
  if (urlPath === '/container') return 'P0';
  if (urlPath === '/dashboard') return 'P0';
  // P1: high-traffic content + critical onboarding flows.
  if (['/today', '/glance', '/build', '/new', '/apps/[slug]'].includes(urlPath)) return 'P1';
  if (urlPath.startsWith('/auth/') || urlPath.startsWith('/invite/')) return 'P1';
  // P2: dashboard sub-pages + magazine/content + everything else public.
  if (shell === 'dashboard' || shell === 'public') return 'P2';
  // P3: admin (we tolerate compact desktop chrome here) + dev/internal.
  if (shell === 'admin' || shell === 'dev') return 'P3';
  return 'P2';
}

async function walk(dir, accum = []) {
  const entries = await readdir(dir);
  for (const entry of entries) {
    const path = join(dir, entry);
    const info = await stat(path);
    if (info.isDirectory()) {
      // Skip generated and internal-only branches that aren't user routes.
      if (entry.startsWith('__') || entry === 'api') continue;
      await walk(path, accum);
    } else if (entry === '+page.svelte') {
      const rel = relative(ROUTES, dir);
      accum.push({ pageFile: relative(ROOT, path), relDir: rel });
    }
  }
  return accum;
}

async function main() {
  const found = await walk(ROUTES);
  const rows = found
    .map(({ pageFile, relDir }) => {
      const urlPath = toUrlPath(relDir);
      const shell = classifyShell(urlPath);
      return {
        urlPath,
        shell,
        priority: priorityFor(urlPath, shell),
        pageFile,
      };
    })
    .sort((a, b) => {
      const pri = a.priority.localeCompare(b.priority);
      if (pri !== 0) return pri;
      return a.urlPath.localeCompare(b.urlPath);
    });

  const summary = {
    generatedAt: new Date().toISOString(),
    counts: rows.reduce((acc, row) => {
      acc.total = (acc.total ?? 0) + 1;
      acc[row.shell] = (acc[row.shell] ?? 0) + 1;
      acc[`priority_${row.priority}`] = (acc[`priority_${row.priority}`] ?? 0) + 1;
      return acc;
    }, {}),
    rows,
  };

  await writeFile(OUT_JSON, JSON.stringify(summary, null, 2) + '\n');

  // Sidecar Markdown table the audit doc copies in. One row per route;
  // columns are the five viewports the audit checks at, plus a notes
  // column. Cells start as `·` (not-checked); humans flip to ✓/✗ as
  // they run the matrix.
  const md = [];
  md.push('| Route | Shell | Pri | 360×780 | 390×844 | 430×932 | 768×1024 | PWA | Notes |');
  md.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    md.push(`| \`${r.urlPath}\` | ${r.shell} | ${r.priority} | · | · | · | · | · |  |`);
  }
  md.push('');
  await writeFile(OUT_MD, md.join('\n'));

  // Compact stdout summary so this is friendly when run by hand.
  const counts = summary.counts;
  console.log(`[mobile-audit] inventory: ${counts.total} routes`);
  for (const shell of ['public', 'container', 'dashboard', 'admin', 'auth', 'onboarding', 'showcase-wrapper', 'dev']) {
    if (counts[shell]) console.log(`  ${shell.padEnd(18)} ${counts[shell]}`);
  }
  console.log(`  P0=${counts.priority_P0 ?? 0}  P1=${counts.priority_P1 ?? 0}  P2=${counts.priority_P2 ?? 0}  P3=${counts.priority_P3 ?? 0}`);
  console.log(`[mobile-audit] wrote ${relative(ROOT, OUT_JSON)}`);
  console.log(`[mobile-audit] wrote ${relative(ROOT, OUT_MD)}`);
}

main().catch((err) => {
  console.error('[mobile-audit] inventory failed:', err);
  process.exit(1);
});
