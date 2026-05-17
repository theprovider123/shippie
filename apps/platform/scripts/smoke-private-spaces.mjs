#!/usr/bin/env bun
/**
 * Production smoke for Shippie Private Spaces.
 *
 * Proves the full live path:
 *   1. seed a temporary maker, app, and Lucia session in D1
 *   2. create a signed private-space invite through the public API
 *   3. verify the invite page keeps signed space params on the form action
 *   4. claim the invite and verify invite + join-token counters move
 *   5. archive the space from the dashboard action
 *   6. clean every temporary row
 *
 * Usage:
 *   bun scripts/smoke-private-spaces.mjs
 *   bun scripts/smoke-private-spaces.mjs --origin https://shippie.app --database shippie-platform-d1
 */
import { spawnSync } from 'node:child_process';

const args = parseArgs(process.argv.slice(2));
const origin = args.origin ?? 'https://shippie.app';
const database = args.database ?? 'shippie-platform-d1';
const remote = args.local ? false : true;
const keepRows = Boolean(args['keep-rows']);

const runId = cleanId(args.run ?? new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14));
const ids = {
  user: `codex-smoke-user-spaces-${runId}`,
  email: `codex-space-smoke-${runId}@shippie.local`,
  username: `codex_space_smoke_${runId}`,
  app: `codex-smoke-app-spaces-${runId}`,
  slug: `codex-space-smoke-${runId}`,
  session: `codexsmokesessionspaces${runId}`,
  space: `codex-space-smoke-room-${runId}`,
  join: `codex-join-smoke-${runId}`,
};

const cookie = `shippie_session=${ids.session}`;
let inviteId = null;
let inviteToken = null;

try {
  log(`origin=${origin}`);
  log(`database=${database}${remote ? ' --remote' : ' --local'}`);

  await resetScratchRows();
  await seedScratchMaker();

  await expectStatus(`${origin}/__shippie/health`, 200, 'health');
  await expectStatus(`${origin}/dashboard/apps/${ids.slug}/access`, 200, 'authenticated access page', {
    headers: { cookie },
  });

  const invite = await createPrivateSpaceInvite();
  inviteId = invite.invite.id;
  inviteToken = invite.invite.token;
  assert(invite.url.includes('space_sig='), 'invite URL includes signed space capability');
  if (invite.short_url) {
    assert(invite.short_url.includes('space_sig='), 'short URL includes signed space capability');
  }
  log(`created invite ${inviteToken}`);

  await assertPersistedSpace({ expectedClaims: 0, expectedUses: 0 });
  await assertInvitePagePreservesCapability(invite.url);
  await claimInvite(invite.url);
  await assertPersistedSpace({ expectedClaims: 1, expectedUses: 1 });
  await archiveSpace();
  await assertArchivedSpace();

  log('PASS private spaces production smoke');
} finally {
  if (keepRows) {
    log('keeping scratch rows because --keep-rows was set');
  } else {
    await cleanupScratchRows();
    await assertCleanup();
  }
}

async function createPrivateSpaceInvite() {
  const res = await fetch(`${origin}/api/apps/${encodeURIComponent(ids.slug)}/invites`, {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      space_id: ids.space,
      space_name: 'Codex Smoke Room',
      space_role: 'member',
      space_join: ids.join,
      max_uses: 2,
    }),
  });
  const body = await readJson(res);
  assert(res.ok, `create invite returned ${res.status}: ${JSON.stringify(body)}`);
  assert(body?.invite?.id && body?.invite?.token && body?.url, 'create invite returned invite and URL');
  return body;
}

async function assertInvitePagePreservesCapability(url) {
  const res = await fetch(url);
  const html = await res.text();
  assert(res.ok, `invite page returned ${res.status}`);
  assert(html.includes('Join private space'), 'invite page renders join CTA');
  assert(html.includes('action="?/claim&amp;space='), 'invite form action preserves query params');
  assert(html.includes(`space=${ids.space}`), 'invite form contains space id');
  assert(html.includes(`role=member`), 'invite form contains role');
  assert(html.includes(`space_join=${ids.join}`), 'invite form contains join token');
  assert(html.includes('space_sig='), 'invite form contains signature');
  log('invite page preserves signed capability in form action');
}

async function claimInvite(url) {
  const parsed = new URL(url);
  const claimUrl = new URL(parsed);
  claimUrl.search = `?/claim&${parsed.searchParams.toString()}`;
  const res = await fetch(claimUrl, {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: '',
    redirect: 'manual',
  });
  const text = await res.text();
  assert(res.status === 200 || res.status === 303, `claim returned ${res.status}: ${text}`);
  assert(
    text.includes(`/container?app=${ids.slug}`) || res.headers.get('location')?.includes(`/container?app=${ids.slug}`),
    'claim redirects to focused container',
  );
  assert(text.includes(`space=${ids.space}`) || res.headers.get('location')?.includes(`space=${ids.space}`), 'claim preserves space id');
  log('claimed invite');
}

async function archiveSpace() {
  const res = await fetch(`${origin}/dashboard/apps/${encodeURIComponent(ids.slug)}/access?/archiveSpace`, {
    method: 'POST',
    headers: {
      cookie,
      origin,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ spaceId: ids.space, reason: 'codex-smoke' }).toString(),
  });
  const text = await res.text();
  assert(res.ok, `archive returned ${res.status}: ${text}`);
  assert(text.includes(ids.space), 'archive response names archived space');
  log('archived space');
}

async function assertPersistedSpace({ expectedClaims, expectedUses }) {
  const results = await d1([
    `SELECT id, name, status, created_by FROM spaces WHERE id = '${sql(ids.space)}'`,
    `SELECT space_id, app_id, app_slug FROM space_apps WHERE space_id = '${sql(ids.space)}'`,
    `SELECT id, role, max_claims, claim_count FROM space_join_tokens WHERE space_id = '${sql(ids.space)}'`,
    `SELECT id, token, max_uses, used_count FROM app_invites WHERE app_id = '${sql(ids.app)}'`,
  ]);
  assert(results[0]?.results?.[0]?.id === ids.space, 'space row exists');
  assert(results[1]?.results?.[0]?.app_id === ids.app, 'space app row exists');
  assert(results[2]?.results?.[0]?.id === ids.join, 'space join token row exists');
  assert(results[2]?.results?.[0]?.claim_count === expectedClaims, `join-token claim_count is ${expectedClaims}`);
  assert(results[3]?.results?.[0]?.id === inviteId, 'app invite row exists');
  assert(results[3]?.results?.[0]?.token === inviteToken, 'app invite token matches API response');
  assert(results[3]?.results?.[0]?.used_count === expectedUses, `invite used_count is ${expectedUses}`);
  log(`database counters claims=${expectedClaims} uses=${expectedUses}`);
}

async function assertArchivedSpace() {
  const results = await d1([`SELECT status, archive_reason FROM spaces WHERE id = '${sql(ids.space)}'`]);
  assert(results[0]?.results?.[0]?.status === 'archived', 'space was archived');
  log('database archive state verified');
}

async function expectStatus(url, expected, label, init = {}) {
  const res = await fetch(url, { ...init, redirect: 'manual' });
  assert(res.status === expected, `${label} returned ${res.status}, expected ${expected}`);
  log(`${label} ${expected}`);
}

async function seedScratchMaker() {
  const expires = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  await d1([
    `INSERT INTO users (id, email, username, display_name, is_admin) VALUES ('${sql(ids.user)}', '${sql(ids.email)}', '${sql(ids.username)}', 'Codex Space Smoke', 0)`,
    `INSERT INTO apps (id, slug, name, type, category, source_type, maker_id, visibility_scope) VALUES ('${sql(ids.app)}', '${sql(ids.slug)}', 'Codex Space Smoke', 'app', 'tools', 'zip', '${sql(ids.user)}', 'private')`,
    `INSERT INTO sessions (id, user_id, expires_at) VALUES ('${sql(ids.session)}', '${sql(ids.user)}', ${expires})`,
  ]);
  log('seeded scratch maker/app/session');
}

async function resetScratchRows() {
  await cleanupScratchRows();
}

async function cleanupScratchRows() {
  await d1([
    `DELETE FROM space_audit_log WHERE space_id = '${sql(ids.space)}' OR actor_id = '${sql(ids.user)}' OR app_id = '${sql(ids.app)}'`,
    `DELETE FROM space_join_tokens WHERE space_id = '${sql(ids.space)}' OR app_id = '${sql(ids.app)}'`,
    `DELETE FROM space_apps WHERE space_id = '${sql(ids.space)}' OR app_id = '${sql(ids.app)}'`,
    `DELETE FROM spaces WHERE id = '${sql(ids.space)}' OR created_by = '${sql(ids.user)}'`,
    `DELETE FROM app_access WHERE app_id = '${sql(ids.app)}' OR user_id = '${sql(ids.user)}'`,
    `DELETE FROM app_invites WHERE app_id = '${sql(ids.app)}' OR created_by = '${sql(ids.user)}'`,
    `DELETE FROM sessions WHERE user_id = '${sql(ids.user)}' OR id = '${sql(ids.session)}'`,
    `DELETE FROM apps WHERE id = '${sql(ids.app)}' OR slug = '${sql(ids.slug)}'`,
    `DELETE FROM users WHERE id = '${sql(ids.user)}' OR email = '${sql(ids.email)}'`,
  ]);
  log('cleaned scratch rows');
}

async function assertCleanup() {
  const results = await d1([
    `SELECT COUNT(*) AS count FROM users WHERE id = '${sql(ids.user)}' OR email = '${sql(ids.email)}'`,
    `SELECT COUNT(*) AS count FROM apps WHERE id = '${sql(ids.app)}' OR slug = '${sql(ids.slug)}'`,
    `SELECT COUNT(*) AS count FROM sessions WHERE user_id = '${sql(ids.user)}' OR id = '${sql(ids.session)}'`,
    `SELECT COUNT(*) AS count FROM app_invites WHERE app_id = '${sql(ids.app)}' OR created_by = '${sql(ids.user)}'`,
    `SELECT COUNT(*) AS count FROM spaces WHERE id = '${sql(ids.space)}' OR created_by = '${sql(ids.user)}'`,
    `SELECT COUNT(*) AS count FROM space_join_tokens WHERE space_id = '${sql(ids.space)}' OR app_id = '${sql(ids.app)}'`,
    `SELECT COUNT(*) AS count FROM space_audit_log WHERE space_id = '${sql(ids.space)}' OR actor_id = '${sql(ids.user)}' OR app_id = '${sql(ids.app)}'`,
  ]);
  for (const result of results) {
    assert(result.results?.[0]?.count === 0, `cleanup left rows behind: ${JSON.stringify(result.results)}`);
  }
  log('verified cleanup');
}

async function d1(commands) {
  const sqlText = commands.map((command) => command.trim().replace(/;$/, '')).join('; ');
  const argv = ['wrangler', 'd1', 'execute', database, remote ? '--remote' : '--local', '--command', sqlText];
  const result = spawnSync('bunx', argv, {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`wrangler d1 failed\n${result.stdout}\n${result.stderr}`);
  }
  return parseWranglerJson(result.stdout);
}

function parseWranglerJson(output) {
  const clean = output.replace(/\u001b\[[0-9;]*m/g, '');
  const match = clean.match(/\[\s*\{[\s\S]*\]\s*$/);
  if (!match) return [];
  return JSON.parse(match[0]);
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg?.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function cleanId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
}

function sql(value) {
  return String(value).replaceAll("'", "''");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function log(message) {
  console.log(`[smoke-private-spaces] ${message}`);
}
