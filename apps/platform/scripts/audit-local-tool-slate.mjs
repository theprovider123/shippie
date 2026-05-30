#!/usr/bin/env bun
/**
 * Audit first-party showcases against the Local Tool policy.
 *
 * The deploy pipeline already runs the policy scanner for zip upload,
 * CLI deploy, MCP deploy, trial upload, and workspace deploy. This script
 * gives us a launch ledger for the first-party slate so the public grid can
 * stay honest: every row has a policy status, Data Passport state, and a
 * ruling.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLocalToolPolicyScan } from '../../../packages/analyse/src/local-tool-policy.ts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLATFORM_DIR = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(PLATFORM_DIR, '..', '..');
const APPS_DIR = join(REPO_ROOT, 'apps');
const OUT_PATH = join(REPO_ROOT, 'docs', 'launch', 'showcase-audit.md');

const SCANNABLE_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.htm',
  '.js',
  '.jsx',
  '.json',
  '.mjs',
  '.svelte',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
]);
const IGNORED_DIRS = new Set([
  '.git',
  '.svelte-kit',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
]);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function listShowcaseDirs() {
  return readdirSync(APPS_DIR)
    .filter((name) => name.startsWith('showcase-'))
    .map((name) => join(APPS_DIR, name))
    .filter((path) => statSync(path).isDirectory())
    .sort();
}

function walkFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const child = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) stack.push(child);
        continue;
      }
      if (!entry.isFile()) continue;
      if (/\.(?:test|spec)\.[a-z0-9]+$/i.test(entry.name)) continue;
      if (SCANNABLE_EXTENSIONS.has(extname(entry.name).toLowerCase())) files.push(child);
    }
  }
  return files.sort();
}

function filesForPolicyScan(root) {
  const map = new Map();
  for (const file of walkFiles(root)) {
    map.set(relative(root, file), readFileSync(file));
  }
  return map;
}

function slugFor(dir, manifest) {
  if (typeof manifest?.slug === 'string' && manifest.slug.trim()) return manifest.slug.trim();
  return dir.split('/').at(-1)?.replace(/^showcase-/, '') ?? 'unknown';
}

function dataPassportState(manifest, slug) {
  const passport = manifest?.data_passport;
  if (!passport || typeof passport !== 'object') {
    return {
      ok: false,
      label: 'missing',
      detail: `defaults to ${slug}.v1 at deploy, but source manifest should declare it`,
    };
  }
  if (typeof passport.family !== 'string' || !passport.family.trim()) {
    return { ok: false, label: 'invalid', detail: 'missing data_passport.family' };
  }
  if (typeof passport.schema !== 'string' || !passport.schema.trim()) {
    return { ok: false, label: 'invalid', detail: 'missing data_passport.schema' };
  }
  return { ok: true, label: `${passport.family}/${passport.schema}`, detail: 'declared' };
}

function surfaceFor(manifest) {
  const surface = manifest?.curation?.surface;
  return typeof surface === 'string' && surface ? surface : 'featured';
}

function hasLocalData(manifest, report) {
  return Boolean(
    manifest?.local?.database ||
      manifest?.data_schemas ||
      report.capabilityHints.localDb ||
      report.capabilityHints.localFiles,
  );
}

function rulingFor({ report, surface, dataPassport, localData }) {
  if (!report.passed) return 'convert';
  if (surface === 'labs' || surface === 'archived') return surface;
  if (localData && !dataPassport.ok) return 'fix-passport';
  return 'launch';
}

function topFindings(report) {
  return report.findings
    .filter((finding) => finding.severity !== 'info')
    .slice(0, 2)
    .map((finding) => `${finding.severity}: ${finding.title} (${finding.location})`)
    .join('<br>');
}

function markdownTable(rows) {
  const body = rows
    .map((row) =>
      [
        row.slug,
        row.surface,
        row.ruling,
        row.policy,
        row.dataPassport,
        row.capabilities,
        row.findings || '—',
      ]
        .map((cell) => String(cell).replaceAll('\n', '<br>'))
        .join(' | '),
    )
    .map((line) => `| ${line} |`)
    .join('\n');
  return [
    '| Showcase | Surface | Ruling | Policy | Data Passport | Capability Hints | Findings |',
    '|---|---:|---|---|---|---|---|',
    body,
  ].join('\n');
}

const rows = [];
for (const dir of listShowcaseDirs()) {
  const manifestPath = join(dir, 'shippie.json');
  const manifest = existsSync(manifestPath) ? readJson(manifestPath) : null;
  const slug = slugFor(dir, manifest);
  const report = runLocalToolPolicyScan(filesForPolicyScan(dir));
  const surface = surfaceFor(manifest);
  const dataPassport = dataPassportState(manifest, slug);
  const localData = hasLocalData(manifest, report);
  const ruling = rulingFor({ report, surface, dataPassport, localData });
  const capabilities = Object.entries(report.capabilityHints)
    .filter(([, value]) => (typeof value === 'boolean' ? value : value.domains.length > 0))
    .map(([key, value]) => (key === 'referenceData' ? `reference:${value.domains.join(',')}` : key))
    .join(', ');

  rows.push({
    slug,
    surface,
    ruling,
    policy: `${report.status} (${report.blocks} blocks, ${report.warns} warns)`,
    dataPassport: dataPassport.ok ? dataPassport.label : `${dataPassport.label}: ${dataPassport.detail}`,
    capabilities: capabilities || 'none detected',
    findings: topFindings(report),
  });
}

rows.sort((a, b) => a.slug.localeCompare(b.slug));

const counts = rows.reduce((acc, row) => {
  acc[row.ruling] = (acc[row.ruling] ?? 0) + 1;
  return acc;
}, {});

const generatedAt = new Date().toISOString();
const markdown = `# Showcase Local Tool Audit

Generated: ${generatedAt}

This is the launch ledger for first-party showcases. It does not replace the deploy-time Local Tool policy scanner; it records the current slate so we know which tools are ready for the public launcher, which belong in Labs, and which need conversion before launch.

## Summary

${Object.entries(counts)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, count]) => `- ${key}: ${count}`)
  .join('\n')}

## Rulings

- **launch**: policy passes, source can appear in the public launcher.
- **labs** / **archived**: policy passes or is reviewable, but the tool intentionally lives outside the main launch grid.
- **fix-passport**: policy passes, but a local-data tool needs an explicit \`data_passport\` before launch.
- **convert**: policy found a blocker. Convert cloud/auth/tracking/user-data egress to Shippie local primitives before marketplace launch.

${markdownTable(rows)}
`;

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, markdown);

console.log(`[local-tool-audit] wrote ${relative(REPO_ROOT, OUT_PATH)}`);
console.log(
  `[local-tool-audit] ${Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `${key}=${count}`)
    .join(' ')}`,
);
