#!/usr/bin/env bun
/**
 * Mobile-audit static rules.
 *
 * Scans apps/platform/src/{routes,lib} for two classes of mobile drift:
 *
 *   1. Breakpoint drift.
 *      The platform's mobile policy permits only {640, 1024} as shell
 *      breakpoints, plus {1280, 1536, 1920} for density (grid-column
 *      count) breakpoints. Anything else is a finding.
 *
 *   2. Tap-target floor.
 *      Apple HIG floor is 44×44 px. We grep for explicit `width: Npx`
 *      / `height: Npx` / `min-height: Npx` declarations under 44px on
 *      `button`, `a`, or class names that look interactive (.tap-*,
 *      .nav-*, .row, .action, .toggle, .close, .tab). False positives
 *      are expected — review before reacting.
 *
 * Exit code is 0 regardless of findings. PR0 establishes the baseline;
 * PR1+ may flip the script to non-zero once known violations are fixed.
 *
 * Run:
 *   bun apps/platform/scripts/mobile-audit/audit-static-rules.mjs
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const SRC = join(ROOT, 'apps/platform/src');
const REPORT = join(HERE, 'static-rules-report.md');

const ALLOWED_SHELL_BPS = new Set([640, 1024]);
const ALLOWED_DENSITY_BPS = new Set([1280, 1536, 1920]);
const TAP_FLOOR = 44;

// Classes a humans wired as interactive — we apply the tap-floor rule
// to declarations inside CSS rule blocks targeting these.
const INTERACTIVE_SELECTORS = [
  'button',
  /\ba\s*[\.:,{\s]/, // <a> tag
  '.close',
  '.toggle',
  '.tap-',
  '.nav-',
  '.row',
  '.action',
  '.tab',
  '.cta',
  '.chip',
  '.pill',
];

function isInteractiveBlock(selectorLine) {
  return INTERACTIVE_SELECTORS.some((sel) =>
    typeof sel === 'string' ? selectorLine.includes(sel) : sel.test(selectorLine),
  );
}

async function walk(dir, accum = []) {
  const entries = await readdir(dir);
  for (const entry of entries) {
    const path = join(dir, entry);
    const info = await stat(path);
    if (info.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('_generated')) continue;
      await walk(path, accum);
    } else if (entry.endsWith('.svelte') || entry.endsWith('.css')) {
      accum.push(path);
    }
  }
  return accum;
}

function findBreakpointDrift(text, filePath) {
  const findings = [];
  const re = /@media\s*\(\s*(max-width|min-width)\s*:\s*(\d+)px/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const [, dir, raw] = match;
    const value = Number(raw);
    if (ALLOWED_SHELL_BPS.has(value) || ALLOWED_DENSITY_BPS.has(value)) continue;
    const line = text.slice(0, match.index).split('\n').length;
    findings.push({ filePath, line, kind: 'breakpoint', dir, value });
  }
  return findings;
}

function findTapTargets(text, filePath) {
  const findings = [];
  // Walk top-level rule blocks. Naive matcher: <selector>{<body>}. Works
  // for Svelte <style> blocks because we don't nest @media inside the
  // selectors we care about (rule depths are shallow).
  const blockRe = /([^{}\n]+)\{([^{}]+)\}/g;
  let block;
  while ((block = blockRe.exec(text)) !== null) {
    const [, selector, body] = block;
    if (!isInteractiveBlock(selector)) continue;
    // Only flag size declarations that pin to a fixed pixel value.
    const sizeRe = /\b(min-height|height|width|min-width)\s*:\s*(\d+)px\b/g;
    let size;
    while ((size = sizeRe.exec(body)) !== null) {
      const [, prop, raw] = size;
      const value = Number(raw);
      if (value >= TAP_FLOOR) continue;
      const offset = block.index + ('{'.length) + selector.length + size.index;
      const line = text.slice(0, offset).split('\n').length;
      findings.push({
        filePath,
        line,
        kind: 'tap-target',
        prop,
        value,
        selector: selector.replace(/\s+/g, ' ').trim().slice(0, 80),
      });
    }
  }
  return findings;
}

async function main() {
  const files = await walk(SRC);
  const all = { breakpoints: [], tapTargets: [] };
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    all.breakpoints.push(...findBreakpointDrift(text, file));
    all.tapTargets.push(...findTapTargets(text, file));
  }

  const byFileBp = new Map();
  for (const f of all.breakpoints) {
    const key = relative(ROOT, f.filePath);
    if (!byFileBp.has(key)) byFileBp.set(key, []);
    byFileBp.get(key).push(f);
  }
  const byFileTap = new Map();
  for (const f of all.tapTargets) {
    const key = relative(ROOT, f.filePath);
    if (!byFileTap.has(key)) byFileTap.set(key, []);
    byFileTap.get(key).push(f);
  }

  const md = [];
  md.push('# Mobile-audit — static rules report');
  md.push('');
  md.push(`_Generated ${new Date().toISOString()}_`);
  md.push('');
  md.push('Allowed shell breakpoints: 640, 1024.');
  md.push('Allowed density (grid-column) breakpoints: 1280, 1536, 1920.');
  md.push(`Tap-target floor: ${TAP_FLOOR}px (Apple HIG).`);
  md.push('');
  md.push(`Findings: ${all.breakpoints.length} breakpoint drift, ${all.tapTargets.length} tap-target.`);
  md.push('');
  md.push('## Breakpoint drift');
  if (all.breakpoints.length === 0) {
    md.push('_None._');
  } else {
    for (const [file, list] of [...byFileBp.entries()].sort()) {
      md.push(`- \`${file}\``);
      for (const f of list) md.push(`  - L${f.line}: \`${f.dir}: ${f.value}px\``);
    }
  }
  md.push('');
  md.push('## Tap-target floor');
  if (all.tapTargets.length === 0) {
    md.push('_None._');
  } else {
    for (const [file, list] of [...byFileTap.entries()].sort()) {
      md.push(`- \`${file}\``);
      for (const f of list)
        md.push(`  - L${f.line}: \`${f.prop}: ${f.value}px\` in \`${f.selector}\``);
    }
  }
  md.push('');

  await writeFile(REPORT, md.join('\n'));

  console.log(`[mobile-audit] static rules:`);
  console.log(`  breakpoint drift: ${all.breakpoints.length} finding${all.breakpoints.length === 1 ? '' : 's'} across ${byFileBp.size} file${byFileBp.size === 1 ? '' : 's'}`);
  console.log(`  tap-target floor: ${all.tapTargets.length} finding${all.tapTargets.length === 1 ? '' : 's'} across ${byFileTap.size} file${byFileTap.size === 1 ? '' : 's'}`);
  console.log(`[mobile-audit] wrote ${relative(ROOT, REPORT)}`);
}

main().catch((err) => {
  console.error('[mobile-audit] static rules failed:', err);
  process.exit(1);
});
