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
 *   3. Relies on `prepare-showcases.mjs` to regenerate the first-party
 *      showcase catalog from apps/showcase-* (curation surface/visibility/
 *      tier come from each app's `shippie.json#curation`, not state.ts).
 *   4. PRINTS a ready-to-paste `curatedAppSpecs` entry. The scaffold no
 *      longer string-splices `state.ts` — that hand-edit collided badly
 *      under concurrent agents (last-write-wins squashed registry edits).
 *      The maker pastes the snippet into the array once, deliberately.
 *   5. Writes a NEW migration `apps/platform/drizzle/<NNNN>_seed_<slug>.sql`
 *      using `nextMigrationNumber()` (the same allocator CI enforces), so
 *      the file can never collide with an existing number. We never mutate
 *      an already-applied migration.
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
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextMigrationNumber } from './check-migrations.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLATFORM_DIR = resolve(__dirname, '..');
const REPO_ROOT = resolve(PLATFORM_DIR, '..', '..');
const APPS_DIR = resolve(REPO_ROOT, 'apps');
const TEMPLATE_DIR = resolve(REPO_ROOT, 'templates', 'showcase-template');
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

console.log('→ showcase catalog will refresh on next prepare-showcases/build run');

console.log('→ writing seed migration');
const migrationName = writeSeedMigration(slug, name, desc, accent);

const specSnippet = curatedAppSpec(slug, name, short, desc, accent, port);

console.log(`\n✓ Scaffold complete: apps/showcase-${slug}/`);
console.log(`✓ Migration: drizzle/${migrationName} (run \`bun run db:migrate:local\` to apply)`);
console.log('\n' + '─'.repeat(72));
console.log('PASTE this into `curatedAppSpecs` in src/lib/container/state.ts:');
console.log('(left as a manual paste on purpose — auto-splicing collided under');
console.log(' concurrent agents. One deliberate edit beats a silent clobber.)');
console.log('─'.repeat(72));
console.log(specSnippet);
console.log('─'.repeat(72));
console.log('\nNext:');
console.log('  1. Paste the snippet above into curatedAppSpecs (one place, once).');
console.log('  2. cd apps/showcase-' + slug + ' && bun install (or `bun install` at the root)');
console.log('  3. bun run dev:apps  # to bring up all showcases');
console.log('  4. Open http://localhost:4101/container — the new app appears in the curated list');
console.log('  5. Edit src/App.tsx, declare curation + intents in shippie.json.');

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

/**
 * Build the `curatedAppSpecs` entry to paste into state.ts.
 *
 * Returns a string — it deliberately does NOT write the file. The previous
 * version string-spliced state.ts, which (a) targeted the old `curatedApps`
 * array shape that no longer exists after the curation refactor, and (b)
 * collided destructively when two agents scaffolded apps at once
 * (last-commit-wins squashed each other's registry edits). A printed snippet
 * the maker pastes once is both correct and conflict-free.
 *
 * The shape mirrors the `CuratedAppSpec` type in state.ts: slug, name,
 * shortName, description, appKind, icon, accent, category, port, intents.
 */
function curatedAppSpec(slug, name, short, desc, accent, port) {
  return `  {
    slug: '${slug}',
    name: ${jsonString(name)},
    shortName: ${jsonString(short)},
    description: ${jsonString(desc)},
    appKind: 'local',
    icon: ${jsonString(short.slice(0, 2).toUpperCase())},
    accent: '${accent}',
    category: 'utilities',
    port: ${port},
    // TODO: declare provides/consumes intents once the surface exists.
    // Use the local intent vocabulary (e.g. 'meal-planned'); the manifest
    // contract resolves these to canonical @shippie/intents via
    // canonicalIntentFor. Leave omitted until the app actually emits.
    // intents: { provides: [], consumes: [] },
  },`;
}

function jsonString(value) {
  // Use JSON.stringify for safe quoting + escaping of the description.
  return JSON.stringify(value);
}

function writeSeedMigration(slug, name, desc, accent) {
  // Use the same allocator CI enforces (check-migrations.mjs) so the
  // scaffold can never mint a duplicate number. max+1, zero-padded.
  const next = nextMigrationNumber(DRIZZLE_DIR);
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
