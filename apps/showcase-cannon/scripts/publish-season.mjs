#!/usr/bin/env node
/**
 * The Cannon — season feed publisher (the weekly update path).
 *
 * Reads the canonical season JSON (src/season/*.json) and publishes each
 * file to the platform Feed Protocol endpoint. Identical payloads are
 * no-ops server-side (hash match), so running this repeatedly is safe.
 *
 * Usage:
 *   node scripts/publish-season.mjs --dry-run            # validate + show hashes
 *   node scripts/publish-season.mjs                      # publish to production
 *   node scripts/publish-season.mjs --origin http://localhost:4101   # local dev
 *   node scripts/publish-season.mjs --only match-live    # one feed (matchday!)
 *
 * Auth: feeds POST is admin-gated. Provide a logged-in admin session cookie:
 *   CANNON_PUBLISH_COOKIE='session=…' node scripts/publish-season.mjs
 * (Grab it from devtools on shippie.app while signed in as the admin, or use
 * the local magic-link flow against the dev server.)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const seasonDir = path.join(here, '../src/season');

const FEEDS = [
  { feed: 'fixtures', schema: 'cannon.fixtures.v1', file: 'fixtures.json', staleAfterH: 26 },
  { feed: 'match-live', schema: 'cannon.match.v1', file: 'match.json', staleAfterH: 6 },
  { feed: 'squad', schema: 'cannon.squad.v1', file: 'squad.json', staleAfterH: 192 },
  { feed: 'news', schema: 'cannon.news.v1', file: 'news.json', staleAfterH: 26 },
  { feed: 'club', schema: 'cannon.club.v1', file: 'club.json', staleAfterH: 1440 },
];

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const origin = opt('--origin', 'https://shippie.app').replace(/\/$/, '');
const only = opt('--only', null);
const dryRun = flag('--dry-run');
const cookie = process.env.CANNON_PUBLISH_COOKIE ?? '';

// FNV-1a over canonical JSON — mirrors the platform envelope hash so a dry
// run can tell you what would actually change.
const sortDeep = (v) =>
  Array.isArray(v)
    ? v.map(sortDeep)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])]))
      : v;
const hashPayload = (payload) => {
  const str = JSON.stringify(sortDeep(payload));
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a:${(h >>> 0).toString(16).padStart(8, '0')}`;
};

// Cheap local sanity checks — the server runs the authoritative validators.
function sanity(feed, payload) {
  const fail = (msg) => {
    throw new Error(`${feed}: ${msg}`);
  };
  if (feed === 'fixtures' && !Array.isArray(payload.fixtures)) fail('fixtures[] missing');
  if (feed === 'match-live' && !['idle', 'pre', 'live', 'ht', 'ft'].includes(payload.phase)) fail('bad phase');
  if (feed === 'squad' && !Array.isArray(payload.players)) fail('players[] missing');
  if (feed === 'news') {
    if (!Array.isArray(payload.items)) fail('items[] missing');
    for (const n of payload.items) {
      if (!n.summary || !n.url || !n.source) fail(`news item ${n.id}: needs summary (own words), url, source`);
    }
  }
  if (feed === 'club' && !Array.isArray(payload.trophies)) fail('trophies[] missing');
}

async function publish({ feed, schema, file, staleAfterH }) {
  const payload = JSON.parse(fs.readFileSync(path.join(seasonDir, file), 'utf8'));
  sanity(feed, payload);
  const hash = hashPayload(payload);

  if (dryRun) {
    console.log(`  ${feed.padEnd(11)} ${schema.padEnd(20)} ${hash}  (${file})`);
    return;
  }

  const res = await fetch(`${origin}/api/apps/cannon/feeds/${feed}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({
      dataSchema: schema,
      payload,
      staleAfter: new Date(Date.now() + staleAfterH * 3_600_000).toISOString(),
      source: { kind: 'maker-upload', name: 'publish-season.mjs' },
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${feed}: HTTP ${res.status} ${JSON.stringify(body)}`);
  }
  console.log(
    `  ${feed.padEnd(11)} ${body.changed ? `→ sequence ${body.envelope?.sequence}` : 'unchanged (hash match)'}`,
  );
}

const targets = FEEDS.filter((f) => !only || f.feed === only);
if (targets.length === 0) {
  console.error(`unknown --only feed; valid: ${FEEDS.map((f) => f.feed).join(', ')}`);
  process.exit(1);
}

console.log(`${dryRun ? 'DRY RUN — ' : ''}publishing ${targets.length} feed(s) to ${origin}`);
if (!dryRun && !cookie) {
  console.warn('  ⚠ CANNON_PUBLISH_COOKIE not set — the platform will reply 401.');
}

let failed = false;
for (const t of targets) {
  try {
    await publish(t);
  } catch (err) {
    failed = true;
    console.error(`  ✗ ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
