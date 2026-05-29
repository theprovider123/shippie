#!/usr/bin/env bun
/**
 * Showcase overflow audit.
 *
 * This is a deliberately conservative static sweep for the failure class
 * that hit Dough on narrow iPhones: form/row flex children that refuse to
 * shrink, long nowrap labels, fixed widths wider than a small phone, and
 * tables without an obvious horizontal scroll wrapper.
 *
 * It is a baseline/reporting tool, not a deploy gate. It exits 0 even when
 * findings exist so reviewers can separate intentional chips/print tables
 * from real mobile overflow.
 *
 * Run:
 *   bun apps/platform/scripts/mobile-audit/audit-showcase-overflow.mjs
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const APPS = join(ROOT, 'apps');
const REPORT = join(HERE, 'showcase-overflow-report.md');
const PHONE_WIDTH = 360;

const SOURCE_EXTS = new Set(['.css', '.svelte', '.tsx', '.ts', '.jsx', '.js']);
const CSS_EXTS = new Set(['.css', '.svelte']);
const FORM_ROW_SELECTOR =
  /\.(field-row|form-row|row-actions|field--inline|mesh-controls|add-form|compose|snapshot-bar|done-form-actions|timer-actions|sheet-actions|page-actions|tool-actions)\b|\bform\b/i;
const FLEX_CHILD_SELECTOR =
  /\.(field|grow|currency|row-name|row-note|name|body|search-input|share-url)\b|\b(input|select|textarea)\b/i;
const LAYOUT_SELECTOR_HINT =
  /\b(html|body|#root|#app|main|canvas|svg|img|video|iframe|page|screen|shell|viewport|stage|board|map|chart|modal|sheet|dialog|app)\b/i;

async function walk(dir, accum = []) {
  const entries = await readdir(dir);
  for (const entry of entries) {
    const path = join(dir, entry);
    const info = await stat(path);
    if (info.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.svelte-kit') continue;
      await walk(path, accum);
      continue;
    }
    const ext = entry.slice(entry.lastIndexOf('.'));
    if (SOURCE_EXTS.has(ext)) accum.push(path);
  }
  return accum;
}

async function showcaseDirs() {
  const entries = await readdir(APPS, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('showcase-'))
    .map((entry) => join(APPS, entry.name, 'src'));
}

function lineFor(text, index) {
  return text.slice(0, index).split('\n').length;
}

function compactSelector(selector) {
  return selector.replace(/\s+/g, ' ').trim().slice(0, 100);
}

function cssBlocks(text) {
  const blocks = [];
  const re = /([^{}\n][^{}]*)\{([^{}]+)\}/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const [, selector, body] = match;
    if (selector.trim().startsWith('@')) continue;
    blocks.push({ selector, body, index: match.index });
  }
  return blocks;
}

function findFlexNoWrap(text, filePath) {
  const findings = [];
  for (const block of cssBlocks(text)) {
    const selector = compactSelector(block.selector);
    if (!FORM_ROW_SELECTOR.test(selector)) continue;
    if (!/\bdisplay\s*:\s*(inline-)?flex\b/.test(block.body)) continue;
    if (/\bflex-wrap\s*:\s*(wrap|wrap-reverse)\b/.test(block.body)) continue;
    findings.push({
      kind: 'flex-no-wrap-row',
      filePath,
      line: lineFor(text, block.index),
      detail: selector,
    });
  }
  return findings;
}

function findFlexMissingMinWidth(text, filePath) {
  const findings = [];
  for (const block of cssBlocks(text)) {
    const selector = compactSelector(block.selector);
    if (!FLEX_CHILD_SELECTOR.test(selector)) continue;
    if (!/\bflex(?:-grow)?\s*:\s*(?:1|[1-9]\d*)/.test(block.body)) continue;
    if (/\bmin-width\s*:\s*0\b/.test(block.body)) continue;
    if (LAYOUT_SELECTOR_HINT.test(selector)) continue;
    findings.push({
      kind: 'flex-child-missing-min-width',
      filePath,
      line: lineFor(text, block.index),
      detail: selector,
    });
  }
  return findings;
}

function findNowrapNoEllipsis(text, filePath) {
  const findings = [];
  for (const block of cssBlocks(text)) {
    if (!/\bwhite-space\s*:\s*nowrap\b/.test(block.body)) continue;
    const hasEllipsis = /\btext-overflow\s*:\s*ellipsis\b/.test(block.body);
    const hidesOverflow = /\boverflow(?:-x)?\s*:\s*hidden\b/.test(block.body);
    if (hasEllipsis && hidesOverflow) continue;
    // Explicit allowlist for badges/pills/sr-only elements whose
    // contents are by design always short. Mark the rule with
    // `/* mobile-audit-allow: nowrap-intentional */` to skip.
    if (/mobile-audit-allow:\s*nowrap-intentional/i.test(block.body)) continue;
    findings.push({
      kind: 'nowrap-no-ellipsis',
      filePath,
      line: lineFor(text, block.index),
      detail: compactSelector(block.selector),
    });
  }
  return findings;
}

function findFixedWidthOverflow(text, filePath) {
  const findings = [];
  for (const block of cssBlocks(text)) {
    const selector = compactSelector(block.selector);
    if (LAYOUT_SELECTOR_HINT.test(selector)) continue;
    if (/\bmax-width\s*:\s*(?:100%|calc|min|clamp|var)/.test(block.body)) continue;
    const re = /(?:^|[;\s{])(width|min-width)\s*:\s*(\d+)px\b/g;
    let match;
    while ((match = re.exec(block.body)) !== null) {
      const [, prop, raw] = match;
      const width = Number(raw);
      if (width <= PHONE_WIDTH) continue;
      findings.push({
        kind: 'fixed-width-over-phone',
        filePath,
        line: lineFor(text, block.index + match.index),
        detail: `${prop}: ${width}px in ${selector}`,
      });
    }
  }
  return findings;
}

function findTableNoScroll(text, filePath) {
  if (!/<table[\s>]/i.test(text)) return [];
  if (/\boverflow-x\s*:\s*(auto|scroll)\b/.test(text)) return [];
  // Print-only views are media print and not phone-rendered; their tables
  // are intentional fixed-format layouts. Skipping them here matches the
  // report disclaimer ("print-only tables ... may be acceptable") and
  // stops cluttering the punch list with non-bugs.
  if (/PrintView\.(?:tsx|jsx|ts|js)$/i.test(filePath)) return [];
  // A wrapper className containing "scroll" (e.g. `temp-table-scroll`)
  // signals an external CSS class that handles overflow-x. We trust the
  // wrapper rather than re-scanning every showcase's styles.css.
  if (/className=["'`][^"'`]*-scroll\b[^"'`]*["'`][^>]*>\s*<table/i.test(text)) return [];
  return [
    {
      kind: 'table-without-overflow-x',
      filePath,
      line: lineFor(text, text.search(/<table[\s>]/i)),
      detail: '<table> appears in a file with no overflow-x wrapper',
    },
  ];
}

function groupByKind(findings) {
  return findings.reduce((acc, finding) => {
    const key = finding.kind;
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push(finding);
    return acc;
  }, new Map());
}

async function main() {
  const dirs = await showcaseDirs();
  const files = [];
  for (const dir of dirs) {
    try {
      await walk(dir, files);
    } catch {
      // A showcase can be generated or temporarily missing src; skip it.
    }
  }

  const findings = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const ext = file.slice(file.lastIndexOf('.'));
    if (CSS_EXTS.has(ext)) {
      findings.push(...findFlexNoWrap(text, file));
      findings.push(...findFlexMissingMinWidth(text, file));
      findings.push(...findNowrapNoEllipsis(text, file));
      findings.push(...findFixedWidthOverflow(text, file));
    }
    findings.push(...findTableNoScroll(text, file));
  }

  findings.sort((a, b) => {
    const file = relative(ROOT, a.filePath).localeCompare(relative(ROOT, b.filePath));
    return file || a.line - b.line || a.kind.localeCompare(b.kind);
  });

  const grouped = groupByKind(findings);
  const md = [];
  md.push('# Showcase mobile-overflow report');
  md.push('');
  md.push(`_Generated ${new Date().toISOString()}_`);
  md.push('');
  md.push(`Scanned ${dirs.length} showcases / ${files.length} source files.`);
  md.push('');
  md.push('Findings are review prompts, not automatic failures. Intentional short chips, icon-only controls, print-only tables, and fixed-format canvases may be acceptable.');
  md.push('');
  md.push('## Summary');
  md.push('');
  for (const kind of [
    'flex-no-wrap-row',
    'flex-child-missing-min-width',
    'nowrap-no-ellipsis',
    'fixed-width-over-phone',
    'table-without-overflow-x',
  ]) {
    md.push(`- ${kind}: ${grouped.get(kind)?.length ?? 0}`);
  }
  md.push('');
  md.push('## Findings');
  if (findings.length === 0) {
    md.push('');
    md.push('_None._');
  } else {
    for (const [kind, list] of [...grouped.entries()].sort()) {
      md.push('');
      md.push(`### ${kind}`);
      for (const finding of list) {
        md.push(`- \`${relative(ROOT, finding.filePath)}:${finding.line}\` — ${finding.detail}`);
      }
    }
  }
  md.push('');
  await writeFile(REPORT, md.join('\n'));

  console.log('[mobile-audit] showcase overflow:');
  console.log(`  showcases: ${dirs.length}`);
  console.log(`  files: ${files.length}`);
  for (const [kind, list] of [...grouped.entries()].sort()) {
    console.log(`  ${kind}: ${list.length}`);
  }
  console.log(`  total: ${findings.length}`);
  console.log(`[mobile-audit] wrote ${relative(ROOT, REPORT)}`);
}

main().catch((err) => {
  console.error('[mobile-audit] showcase overflow failed:', err);
  process.exit(1);
});
