#!/usr/bin/env bun
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const root = resolve(process.cwd(), process.argv[2] ?? 'static/__shippie-run');
const BLOCKED_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
const ALLOWED_HOSTS = new Set([
  'shippie.app',
  'www.w3.org',
  'github.com',
  'tile.openstreetmap.org',
  'www.arsenal.com',
  'help.arsenal.com',
  'tfl.gov.uk',
]);
const URL_PATTERN = /\bhttps?:\/\/[^\s"'`<>)\\]+/gi;
const SCANNED_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.webmanifest',
  '.svg',
]);

function extension(path) {
  const match = path.match(/(\.[a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : '';
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (entry.isFile() && SCANNED_EXTENSIONS.has(extension(path))) out.push(path);
  }
  return out;
}

if (!existsSync(root) || !statSync(root).isDirectory()) {
  console.error(`[scan-external-refs] missing directory: ${root}`);
  process.exit(1);
}

const violations = [];
for (const file of walk(root)) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(URL_PATTERN)) {
    const raw = match[0].replace(/[.,;:!?]+$/, '');
    let url;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (BLOCKED_HOSTS.has(url.hostname)) {
      violations.push({ file, url: raw, reason: 'blocked remote asset host' });
      continue;
    }
    const ext = extension(file);
    if (ext === '.js' || ext === '.mjs' || ext === '.json') continue;
    if (!ALLOWED_HOSTS.has(url.hostname)) {
      violations.push({ file, url: raw, reason: 'host not allowlisted' });
    }
  }
}

if (violations.length > 0) {
  console.error(`[scan-external-refs] external references blocked in ${relative(process.cwd(), root)}:`);
  for (const violation of violations.slice(0, 80)) {
    console.error(`  - ${relative(process.cwd(), violation.file)}: ${violation.url} (${violation.reason})`);
  }
  if (violations.length > 80) {
    console.error(`  ...and ${violations.length - 80} more`);
  }
  process.exit(1);
}

console.log(`[scan-external-refs] PASS ${relative(process.cwd(), root)} contains no unapproved external refs`);
