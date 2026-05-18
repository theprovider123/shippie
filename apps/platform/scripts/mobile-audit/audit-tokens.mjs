#!/usr/bin/env bun
/**
 * Mobile-audit — token conformance.
 *
 * Complements audit-static-rules.mjs (breakpoints + tap-target floor)
 * with two checks that are genuinely additive:
 *
 *   1. Input font-size floor.
 *      iOS Safari zooms the viewport when a form control is focused
 *      and its computed font-size is below 16px. We grep for explicit
 *      `font-size: Npx` declarations under 16px inside CSS rule blocks
 *      whose selector lists `input`, `textarea`, `select`, or a class
 *      that is itself a form control (.form-input, .input, .text-field).
 *      Container labels like `.field span` are intentionally ignored.
 *
 *   2. Safe-area on bottom-positioned regions.
 *      Sticky/fixed elements anchored to the bottom of the viewport
 *      clip under the iOS home indicator if they don't honour
 *      `env(safe-area-inset-bottom)` or our `--safe-bottom` token. We
 *      flag any rule block that contains BOTH:
 *         a) `position: fixed` (or `sticky`)
 *         b) `bottom: 0` (or `bottom: 0px`)
 *      WITHOUT one of:
 *         - `padding-bottom: ... env(safe-area-inset-bottom)`
 *         - `padding-bottom: ... var(--safe-bottom)`
 *         - `margin-bottom: ... env(safe-area-inset-bottom)`
 *
 * Exit code is 0 regardless of findings — this is a measurement, not a
 * gate. PR1+ may flip the script to non-zero once known violations are
 * fixed.
 *
 * Run:
 *   bun apps/platform/scripts/mobile-audit/audit-tokens.mjs
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..');
const SRC = join(ROOT, 'apps/platform/src');
const REPORT = join(HERE, 'tokens-report.md');

const INPUT_FONT_FLOOR = 16;

// Selectors that should be subject to the 16px input floor.
const FORM_SELECTORS = [
  'input',
  'textarea',
  'select',
  '.form-input',
  '.input',
  '.text-field',
];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      out.push(...(await walk(path)));
    } else if (
      entry.name.endsWith('.svelte') ||
      entry.name.endsWith('.css') ||
      entry.name.endsWith('.scss')
    ) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Crude CSS block tokeniser: walks the file once, tracks brace depth,
 * and yields { selector, body, fileLine } where selector is the line
 * just above the opening `{` and body is the content between `{` and
 * the matching `}`. Skips `@media` / `@keyframes` / `@supports` blocks
 * (they have nested rules; we only check leaf blocks).
 *
 * Good enough for scanning hand-written CSS in .svelte / .css files.
 * Not a real parser.
 */
function selectorBefore(text, index) {
  let j = index - 1;
  while (
    j >= 0 &&
    text[j] !== '}' &&
    text[j] !== '{' &&
    text[j] !== ';'
  ) {
    j--;
  }
  return text.slice(j + 1, index).trim().replace(/\s+/g, ' ');
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

function* eachRuleBlock(text) {
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      stack.push({
        selector: selectorBefore(text, i),
        start: i + 1,
        line: lineAt(text, i + 1),
      });
    } else if (ch === '}') {
      const block = stack.pop();
      if (!block) continue;
      const body = text.slice(block.start, i);
      if (body.includes('{')) continue;
      if (/^@(media|keyframes|supports|layer|container)/.test(block.selector)) continue;
      yield { selector: block.selector, body, line: block.line };
    }
  }
}

function selectorMatchesForm(selector) {
  const lower = selector.toLowerCase();
  return FORM_SELECTORS.some((sel) => {
    // Word-boundary check for tag selectors; substring for class selectors.
    if (sel.startsWith('.')) return lower.includes(sel);
    const re = new RegExp(`(^|[^\\w-])${sel}([^\\w-]|$)`);
    return re.test(lower);
  });
}

function findFontSizeUnderFloor(body, baseLine) {
  const findings = [];
  const re = /font-size:\s*(\d+(?:\.\d+)?)px/g;
  let match;
  while ((match = re.exec(body)) !== null) {
    const px = parseFloat(match[1]);
    if (px < INPUT_FONT_FLOOR) {
      let line = baseLine;
      for (let k = 0; k < match.index; k++) {
        if (body[k] === '\n') line++;
      }
      findings.push({ line, declaration: match[0], value: px });
    }
  }
  return findings;
}

function ruleNeedsSafeArea(body) {
  // Is this rule positioned to the bottom?
  const hasPosition = /position:\s*(fixed|sticky)\b/.test(body);
  const hasBottomZero = /bottom:\s*0(px)?\b/.test(body);
  if (!hasPosition || !hasBottomZero) return false;
  // Does it acknowledge safe-area? Recognize both longhand
  // `padding-bottom:` / `margin-bottom:` / `inset-block-end:` and the
  // `padding:` / `margin:` shorthand forms when they contain the
  // safe-area token anywhere in the value (which on a 4-value padding
  // would mean the bottom side).
  const SAFE = /(env\(safe-area-inset-bottom|var\(--safe-bottom)/;
  const acknowledges =
    new RegExp(`padding-bottom:[^;]*${SAFE.source}`).test(body) ||
    new RegExp(`margin-bottom:[^;]*${SAFE.source}`).test(body) ||
    new RegExp(`inset-block-end:[^;]*${SAFE.source}`).test(body) ||
    new RegExp(`(?:^|[\\s;])padding:[^;]*${SAFE.source}`).test(body) ||
    new RegExp(`(?:^|[\\s;])margin:[^;]*${SAFE.source}`).test(body);
  return !acknowledges;
}

async function scan() {
  const files = await walk(SRC);
  const inputFindings = [];
  const safeAreaFindings = [];

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const block of eachRuleBlock(text)) {
      if (selectorMatchesForm(block.selector)) {
        for (const f of findFontSizeUnderFloor(block.body, block.line)) {
          inputFindings.push({
            file: relative(ROOT, file),
            line: f.line,
            selector: block.selector,
            declaration: f.declaration,
          });
        }
      }
      if (ruleNeedsSafeArea(block.body)) {
        safeAreaFindings.push({
          file: relative(ROOT, file),
          line: block.line,
          selector: block.selector,
        });
      }
    }
  }

  return { inputFindings, safeAreaFindings };
}

function groupByFile(findings) {
  const grouped = new Map();
  for (const f of findings) {
    const list = grouped.get(f.file) ?? [];
    list.push(f);
    grouped.set(f.file, list);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
}

async function main() {
  const { inputFindings, safeAreaFindings } = await scan();
  const lines = [];
  lines.push(`# Mobile-audit — tokens report`);
  lines.push('');
  lines.push(`_Generated ${new Date().toISOString()}_`);
  lines.push('');
  lines.push(
    `Input font-size floor: ${INPUT_FONT_FLOOR}px (iOS focus-zoom prevention).`,
  );
  lines.push(
    `Safe-area rule: \`position: fixed/sticky\` + \`bottom: 0\` must include \`env(safe-area-inset-bottom)\` or \`var(--safe-bottom)\`.`,
  );
  lines.push('');
  lines.push(
    `Findings: ${inputFindings.length} input font-size, ${safeAreaFindings.length} safe-area.`,
  );
  lines.push('');

  lines.push(`## Input font-size under 16px`);
  if (inputFindings.length === 0) {
    lines.push('(no findings)');
  } else {
    for (const [file, items] of groupByFile(inputFindings)) {
      lines.push(`- \`${file}\``);
      for (const f of items) {
        lines.push(`  - L${f.line}: \`${f.declaration}\` in \`${f.selector}\``);
      }
    }
  }
  lines.push('');

  lines.push(`## Bottom-positioned rules without safe-area`);
  if (safeAreaFindings.length === 0) {
    lines.push('(no findings)');
  } else {
    for (const [file, items] of groupByFile(safeAreaFindings)) {
      lines.push(`- \`${file}\``);
      for (const f of items) {
        lines.push(`  - L${f.line}: \`${f.selector}\``);
      }
    }
  }
  lines.push('');

  const report = lines.join('\n');
  await writeFile(REPORT, report);
  console.log(`[mobile-audit] tokens:`);
  console.log(
    `  input font-size under ${INPUT_FONT_FLOOR}px: ${inputFindings.length} findings across ${groupByFile(inputFindings).length} files`,
  );
  console.log(
    `  bottom-positioned without safe-area: ${safeAreaFindings.length} findings across ${groupByFile(safeAreaFindings).length} files`,
  );
  console.log(`[mobile-audit] wrote ${relative(ROOT, REPORT)}`);
}

await main();
