#!/usr/bin/env bun
/**
 * Generate monogram SVG icons for showcase apps that don't have one.
 *
 * Walks every apps/showcase-* /shippie.json. If the referenced icon
 * file is missing from public/, dist/, or src/, generates a square
 * SVG with the app's themeColor + first letter and writes it to
 * public/icon.svg. Updates the shippie.json icon field to /icon.svg
 * when the previous reference was a .png that didn't resolve.
 *
 * Idempotent: skips any showcase whose icon already resolves. Safe to
 * re-run after adding new showcases.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { monogram, accentColor } from '../packages/design-tokens/src/tool-icon.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

function listShowcaseDirs() {
  const apps = join(REPO_ROOT, 'apps');
  return readdirSync(apps)
    .filter((name) => name.startsWith('showcase-'))
    .map((name) => join(apps, name))
    .filter((p) => existsSync(join(p, 'shippie.json')));
}

function resolveIconFile(showcaseDir, iconPath) {
  if (!iconPath) return null;
  for (const loc of ['public', 'static', 'dist', 'src', '']) {
    const candidate = join(showcaseDir, loc, iconPath);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Build a terminal-style monogram SVG matching ToolGlyph: near-black
 * tile, hybrid 3px radius, hairline accent border, monospace glyph in
 * the accent. Same monogram()/accentColor() as the live component.
 */
export function buildMonogramSvg({ name, slug, themeColor }) {
  const accent = accentColor(slug, themeColor);
  const mark = monogram(name, slug);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect x="0" y="0" width="512" height="512" rx="3" fill="#15110c"/>
  <rect x="0.5" y="0.5" width="511" height="511" rx="3" fill="none" stroke="${accent}" stroke-opacity="0.34"/>
  <rect x="64" y="64" width="32" height="32" rx="1" fill="${accent}" fill-opacity="0.65"/>
  <text x="256" y="300" text-anchor="middle" font-family="JetBrains Mono, ui-monospace, monospace" font-weight="600" font-size="220" fill="${accent}">${mark}</text>
</svg>`;
}

function ensurePublicDir(showcaseDir) {
  const dir = join(showcaseDir, 'public');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

// Only run the file generation when invoked directly (`bun scripts/...`).
// Importing this module (e.g. the parity test importing buildMonogramSvg)
// must NOT touch the working tree.
if (import.meta.main) {
const showcaseDirs = listShowcaseDirs();
let generated = 0;
let skippedOk = 0;
let renamedRefs = 0;
const written = [];

for (const dir of showcaseDirs) {
  const manifestPath = join(dir, 'shippie.json');
  const raw = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);

  const iconRef = typeof manifest.icon === 'string' ? manifest.icon : null;
  if (iconRef && resolveIconFile(dir, iconRef)) {
    skippedOk++;
    continue;
  }

  const slug =
    (typeof manifest.slug === 'string' && manifest.slug) ||
    dir.split('/').pop().replace(/^showcase-/, '');
  const themeColor = typeof manifest.theme_color === 'string' ? manifest.theme_color : null;

  const svg = buildMonogramSvg({ name: manifest.name, slug, themeColor });

  const publicDir = ensurePublicDir(dir);
  const svgPath = join(publicDir, 'icon.svg');
  writeFileSync(svgPath, svg, 'utf8');
  generated++;
  written.push(svgPath.replace(REPO_ROOT + '/', ''));

  if (iconRef !== '/icon.svg') {
    manifest.icon = '/icon.svg';
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    renamedRefs++;
  }
}

console.log(`[generate-monogram-icons] showcases scanned: ${showcaseDirs.length}`);
console.log(`[generate-monogram-icons] icons already present: ${skippedOk}`);
console.log(`[generate-monogram-icons] svg icons generated:   ${generated}`);
console.log(`[generate-monogram-icons] shippie.json updated:  ${renamedRefs}`);
if (written.length > 0) {
  console.log(`[generate-monogram-icons] first 10 written:`);
  for (const p of written.slice(0, 10)) console.log(`  - ${p}`);
}
}
