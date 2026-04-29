#!/usr/bin/env bun
/**
 * P2A — `bun run new:showcase <slug> [name] [accent]` scaffold.
 *
 * Generates a working showcase app from `templates/showcase-template/`.
 * The end-to-end target the plan calls out is "60s from `bun run` to
 * the showcase rendering in the container, including verification".
 *
 * What it does:
 *   1. Reads `templates/showcase-template/` and copies it into
 *      `apps/showcase-<slug>/` with placeholder substitution.
 *   2. Picks the next free port from 5191+ by scanning every existing
 *      `apps/showcase-* /vite.config.ts` for `port: NNNN`.
 *   3. Adds the slug to `FIRST_PARTY_SHOWCASE_SLUGS` in
 *      `apps/platform/src/hooks.server.ts`.
 *   4. Appends a curated-apps entry to
 *      `apps/platform/src/lib/container/state.ts` (with TODO comments
 *      for intents — the maker fills these in once the surface exists).
 *   5. Writes a NEW migration `apps/platform/drizzle/<NNNN>_seed_<slug>.sql`
 *      so `db:migrate` picks it up next run. We never mutate an
 *      already-applied migration.
 *
 * Substitution placeholders:
 *   __SLUG__     — `widgets`
 *   __NAME__     — `Widgets` (or `[name]` arg)
 *   __SHORT__    — first 8 chars of the name (PWA short_name)
 *   __DESC__     — boilerplate description, override with `--desc=...`
 *   __ACCENT__   — `#5EA777` default, override with `[accent]` arg
 *   __PORT__     — auto-assigned 5191+
 *
 * Usage:
 *   bun run new:showcase widgets
 *   bun run new:showcase widgets "Widget Studio" "#3F51B5"
 *
 * The script is idempotent on the directory check — if
 * `apps/showcase-<slug>/` already exists it bails before doing
 * anything destructive.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLATFORM_DIR = resolve(__dirname, '..');
const REPO_ROOT = resolve(PLATFORM_DIR, '..', '..');
const APPS_DIR = resolve(REPO_ROOT, 'apps');
const TEMPLATE_DIR = resolve(REPO_ROOT, 'templates', 'showcase-template');
const HOOKS_FILE = resolve(PLATFORM_DIR, 'src', 'hooks.server.ts');
const STATE_FILE = resolve(PLATFORM_DIR, 'src', 'lib', 'container', 'state.ts');
const DRIZZLE_DIR = resolve(PLATFORM_DIR, 'drizzle');

const args = process.argv.slice(2);
const slug = args[0];
if (!slug || !/^[a-z][a-z0-9-]{1,40}$/.test(slug)) {
  fail(
    'Usage: bun run new:showcase <slug> [name] [accent-hex]\n  slug must be lowercase, start with a letter, alphanumeric + hyphen, ≤40 chars.',
  );
}

const flagDesc = args.find((a) => a.startsWith('--desc='))?.slice('--desc='.length);
const positional = args.filter((a) => !a.startsWith('--'));
const explicitName = positional[1];
const explicitAccent = positional[2];

const name = explicitName ?? toTitle(slug);
const short = name.length <= 8 ? name : name.slice(0, 8);
const desc =
  flagDesc ?? `${name} — generated showcase. Replace this once the app does something.`;
const accent = explicitAccent ?? '#5EA777';
if (!/^#[0-9A-Fa-f]{6}$/.test(accent)) {
  fail(`Accent ${accent} must be a 6-digit hex like #3F51B5.`);
}

const targetDir = resolve(APPS_DIR, `showcase-${slug}`);
if (existsSync(targetDir)) {
  fail(`apps/showcase-${slug}/ already exists — pick a different slug or remove it first.`);
}

const port = nextFreePort();

console.log(`→ scaffolding apps/showcase-${slug}/ (port ${port}, accent ${accent})`);

copyTemplate(TEMPLATE_DIR, targetDir, {
  __SLUG__: slug,
  __NAME__: name,
  __SHORT__: short,
  __DESC__: desc,
  __ACCENT__: accent,
  __PORT__: String(port),
});

console.log('→ registering slug in FIRST_PARTY_SHOWCASE_SLUGS');
patchHooksFile(slug);

console.log('→ adding curated-apps entry to state.ts');
patchCuratedApps(slug, name, short, desc, accent, port);

console.log('→ writing seed migration');
const migrationName = writeSeedMigration(slug, name, desc, accent);

console.log(`\n✓ Scaffold complete: apps/showcase-${slug}/`);
console.log(`✓ Migration: drizzle/${migrationName} (run \`bun run db:migrate:local\` to apply)`);
console.log('\nNext:');
console.log('  1. cd apps/showcase-' + slug + ' && bun install (or `bun install` at the root)');
console.log('  2. bun run dev:apps  # to bring up all showcases');
console.log('  3. Open http://localhost:4101/container — the new app appears in the curated list');
console.log('  4. Edit src/App.tsx, declare intents in shippie.json, fill in TODOs in state.ts');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toTitle(s) {
  return s
    .split('-')
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function nextFreePort() {
  // Existing showcases (per the dev port reference: 5180+) and any
  // future ones picked from 5191+. Scan every showcase's vite.config.ts
  // and find the highest port mentioned. Default to 5191 if nothing
  // matches.
  let highest = 5190;
  const showcases = readdirSync(APPS_DIR).filter((n) => n.startsWith('showcase-'));
  for (const s of showcases) {
    const cfg = resolve(APPS_DIR, s, 'vite.config.ts');
    if (!existsSync(cfg)) continue;
    const m = /port:\s*(\d{4,5})/.exec(readFileSync(cfg, 'utf8'));
    if (!m) continue;
    const port = Number(m[1]);
    if (Number.isFinite(port) && port > highest) highest = port;
  }
  return highest + 1;
}

function copyTemplate(src, dst, replacements) {
  cpSync(src, dst, { recursive: true });
  walkAndReplace(dst, replacements);
}

function walkAndReplace(dir, replacements) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkAndReplace(path, replacements);
    } else if (entry.isFile()) {
      const text = readFileSync(path, 'utf8');
      let next = text;
      for (const [k, v] of Object.entries(replacements)) {
        next = next.split(k).join(v);
      }
      if (next !== text) writeFileSync(path, next, 'utf8');
    }
  }
}

function patchHooksFile(slug) {
  const text = readFileSync(HOOKS_FILE, 'utf8');
  if (text.includes(`'${slug}'`)) {
    console.log(`  ${slug} already in FIRST_PARTY_SHOWCASE_SLUGS — skipping`);
    return;
  }
  const marker = `]);`;
  const setStart = text.indexOf('FIRST_PARTY_SHOWCASE_SLUGS = new Set<string>([');
  if (setStart < 0) fail('Could not find FIRST_PARTY_SHOWCASE_SLUGS in hooks.server.ts.');
  const closeIdx = text.indexOf(marker, setStart);
  if (closeIdx < 0) fail('Could not find closing ]); for FIRST_PARTY_SHOWCASE_SLUGS.');
  const prefix = text.slice(0, closeIdx);
  const rest = text.slice(closeIdx);
  const insert = `  '${slug}',\n`;
  writeFileSync(HOOKS_FILE, prefix + insert + rest, 'utf8');
}

function patchCuratedApps(slug, name, short, desc, accent, port) {
  const text = readFileSync(STATE_FILE, 'utf8');
  if (text.includes(`'/run/${slug}'`)) {
    console.log(`  ${slug} already in curatedApps — skipping`);
    return;
  }
  // Insert just before the closing `];` of the curatedApps array.
  const arrayStart = text.indexOf('export const curatedApps:');
  if (arrayStart < 0) fail('Could not find curatedApps array in state.ts.');
  const closeIdx = text.indexOf('\n];', arrayStart);
  if (closeIdx < 0) fail('Could not find closing `];` of curatedApps.');
  const idLiteral = `app_${slug.replace(/-/g, '_')}`;
  const entry = `  {
    id: '${idLiteral}',
    slug: '${slug}',
    name: ${jsonString(name)},
    shortName: ${jsonString(short)},
    description: ${jsonString(desc)},
    appKind: 'local',
    entry: 'app/index.html',
    labelKind: 'Local',
    icon: ${jsonString(short.slice(0, 2).toUpperCase())},
    accent: '${accent}',
    version: '1',
    // TODO: rotate to a real packageHash once the showcase has a
    // deploy pipeline; the placeholder lets the container load the
    // dev URL without rejecting the manifest.
    packageHash: \`sha256:\${'b'.repeat(64)}\`,
    standaloneUrl: '/run/${slug}',
    // TODO: declare provides/consumes intents once the surface exists.
    permissions: localPermissions('${slug}'),
    devUrl: 'http://localhost:${port}/',
  },\n`;
  writeFileSync(STATE_FILE, text.slice(0, closeIdx + 1) + entry + text.slice(closeIdx + 1), 'utf8');
}

function jsonString(value) {
  // Use JSON.stringify for safe quoting + escaping of the description.
  return JSON.stringify(value);
}

function writeSeedMigration(slug, name, desc, accent) {
  const existing = readdirSync(DRIZZLE_DIR)
    .filter((f) => /^\d{4}_/.test(f))
    .sort();
  const last = existing[existing.length - 1] ?? '0000_init.sql';
  const lastNum = Number(last.slice(0, 4));
  const next = String(lastNum + 1).padStart(4, '0');
  const filename = `${next}_seed_showcase_${slug.replace(/-/g, '_')}.sql`;
  const path = resolve(DRIZZLE_DIR, filename);
  const sql = `-- Auto-generated by scripts/new-showcase.mjs.
-- Adds '${slug}' to the marketplace as a first-party showcase.

INSERT OR IGNORE INTO apps (id, slug, name, tagline, description, type, category, theme_color, background_color, source_type, source_kind, maker_id, visibility_scope, is_archived)
SELECT lower(hex(randomblob(16))), '${slug}', ${sqlString(name)}, ${sqlString(desc)}, ${sqlString(desc)}, 'app', 'utilities', '${accent}', '#FAF7EF', 'zip', 'static', users.id, 'public', 0
FROM users WHERE email = 'devanteprov@gmail.com' LIMIT 1;
--> statement-breakpoint
UPDATE apps SET latest_deploy_status = 'success' WHERE slug = '${slug}';
`;
  writeFileSync(path, sql, 'utf8');
  return filename;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
