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

function firstLetter(name, slug) {
  const source = (name ?? slug ?? '?').trim();
  return source.charAt(0).toUpperCase();
}

/**
 * Build a 512×512 SVG monogram. Fraunces-inspired serif weight,
 * cream-text on themeColor square, matching the Shippie wordmark
 * vocabulary (square corners, generous letter).
 */
function buildMonogramSvg({ letter, themeColor }) {
  const fg = '#EDE4D3';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${themeColor}"/>
  <text
    x="256" y="256"
    fill="${fg}"
    font-family="Fraunces, Georgia, 'Times New Roman', serif"
    font-size="280"
    font-weight="600"
    text-anchor="middle"
    dominant-baseline="central"
    letter-spacing="-2"
  >${letter}</text>
</svg>
`;
}

function ensurePublicDir(showcaseDir) {
  const dir = join(showcaseDir, 'public');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

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

  const letter = firstLetter(manifest.name, manifest.slug);
  const themeColor =
    typeof manifest.theme_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(manifest.theme_color)
      ? manifest.theme_color
      : '#E8603C';

  const svg = buildMonogramSvg({ letter, themeColor });

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
