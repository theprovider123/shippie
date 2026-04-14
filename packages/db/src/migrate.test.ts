/**
 * End-to-end tests for migration 0001_init and the sync_app_latest_deploy
 * trigger.
 *
 * Key invariants under test:
 *   1. Migration 0001 applies cleanly to a fresh PGlite database
 *   2. Re-running is a no-op (ledger drift detection)
 *   3. Reserved slugs are seeded
 *   4. sync_app_latest_deploy trigger handles all the cases from
 *      v6 §18.3 / Fix v5.1.5 Q:
 *        a. First insert — latest_deploy_* populated
 *        b. Same-row status transition — latest_deploy_status updates
 *           (critical for needs_secrets → building → success)
 *        c. Newer version supersedes
 *        d. Failed status reflected in latest_*
 *
 * Spec references:
 *   v6 §10.1 (deploy states)
 *   v6 §18.3 (trigger)
 *   v5.1.5 Fix Q (same-row retry predicate)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDb, type ShippieDbHandle } from './client.ts';
import { runMigrations } from './migrate.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

async function freshDb(): Promise<ShippieDbHandle> {
  const handle = await createDb({ url: 'pglite://memory' });
  await runMigrations(handle, MIGRATIONS_DIR);
  return handle;
}

/**
 * Raw query helper — bypasses Drizzle so tests can assert on low-level
 * trigger behavior without schema round-trips.
 */
async function query<T = unknown>(
  handle: ShippieDbHandle,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  // Both PGlite and postgres-js expose a raw query method on the underlying client.
  const client = (handle.db as unknown as { session: { client: { query?: Function } } }).session
    .client;

  if (typeof client.query === 'function') {
    // PGlite path
    const result = (await client.query(sql, params)) as { rows: T[] };
    return result.rows;
  }

  // postgres-js path (falls through — not used in PGlite tests but kept for parity)
  throw new Error('postgres-js raw query not wired in tests');
}

test('migration 0001 applies cleanly', async () => {
  const handle = await freshDb();
  try {
    const rows = await query<{ count: string }>(
      handle,
      `select count(*)::text as count from __shippie_migrations where name = '0001_init.sql'`,
    );
    assert.equal(rows[0]?.count, '1');
  } finally {
    await handle.close();
  }
});

test('migration runner is idempotent on re-run', async () => {
  const handle = await createDb({ url: 'pglite://memory' });
  try {
    const first = await runMigrations(handle, MIGRATIONS_DIR);
    assert.ok(first.applied.length > 0, 'first run should apply at least one migration');
    assert.equal(first.skipped.length, 0);
    assert.ok(first.applied.includes('0001_init.sql'));

    const second = await runMigrations(handle, MIGRATIONS_DIR);
    assert.equal(second.applied.length, 0, 'second run should apply nothing');
    assert.equal(second.skipped.length, first.applied.length);
    // Every migration applied on the first run must be skipped on the second
    for (const name of first.applied) {
      assert.ok(second.skipped.includes(name), `${name} should be skipped on re-run`);
    }
  } finally {
    await handle.close();
  }
});

test('migration 0002 adds Auth.js adapter tables', async () => {
  const handle = await freshDb();
  try {
    // accounts, sessions, verification_tokens all exist and accept inserts
    await query(
      handle,
      `insert into users (id, email, name) values ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'Alice')`,
    );
    await query(
      handle,
      `insert into accounts (user_id, type, provider, provider_account_id)
       values ('11111111-1111-1111-1111-111111111111', 'oauth', 'github', 'gh-123')`,
    );
    await query(
      handle,
      `insert into sessions (session_token, user_id, expires)
       values ('tok-abc', '11111111-1111-1111-1111-111111111111', now() + interval '30 days')`,
    );
    await query(
      handle,
      `insert into verification_tokens (identifier, token, expires)
       values ('a@test.local', 'magic-xyz', now() + interval '10 minutes')`,
    );

    const rows = await query<{ count: string }>(
      handle,
      `select (select count(*) from accounts) || ',' || (select count(*) from sessions) || ',' || (select count(*) from verification_tokens) as count`,
    );
    assert.equal(rows[0]?.count, '1,1,1');
  } finally {
    await handle.close();
  }
});

test('users table accepts Auth.js style inserts without username', async () => {
  const handle = await freshDb();
  try {
    // Auth.js's createUser hook only sets id/name/email/emailVerified/image.
    // Our users table must accept this shape (username nullable).
    await query(
      handle,
      `insert into users (email, name, image)
       values ('bob@example.com', 'Bob Smith', 'https://example.com/bob.png')`,
    );
    const rows = await query<{ email: string; name: string; username: string | null }>(
      handle,
      `select email, name, username from users where email = 'bob@example.com'`,
    );
    assert.equal(rows[0]?.email, 'bob@example.com');
    assert.equal(rows[0]?.name, 'Bob Smith');
    assert.equal(rows[0]?.username, null);
  } finally {
    await handle.close();
  }
});

test('reserved slugs are seeded', async () => {
  const handle = await freshDb();
  try {
    const rows = await query<{ slug: string; reason: string }>(
      handle,
      `select slug, reason from reserved_slugs where slug in ('shippie', 'admin', 'apple', 'stripe') order by slug`,
    );
    assert.equal(rows.length, 4);
    assert.deepEqual(
      rows.map((r) => r.slug),
      ['admin', 'apple', 'shippie', 'stripe'],
    );
    // Shippie + admin are 'system', apple + stripe are 'brand'
    const byReason = Object.fromEntries(rows.map((r) => [r.slug, r.reason]));
    assert.equal(byReason.shippie, 'system');
    assert.equal(byReason.admin, 'system');
    assert.equal(byReason.apple, 'brand');
    assert.equal(byReason.stripe, 'brand');
  } finally {
    await handle.close();
  }
});

test('sync_app_latest_deploy trigger: first insert populates latest_*', async () => {
  const handle = await freshDb();
  try {
    await query(
      handle,
      `insert into users (id, email, username) values ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'alice')`,
    );
    await query(
      handle,
      `insert into apps (id, slug, name, type, category, source_type, maker_id)
       values ('22222222-2222-2222-2222-222222222222', 'recipes', 'Recipes', 'app', 'food_and_drink', 'zip', '11111111-1111-1111-1111-111111111111')`,
    );

    // Insert a deploy in 'building' state
    await query(
      handle,
      `insert into deploys (id, app_id, version, source_type, status)
       values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 1, 'zip', 'building')`,
    );

    const rows = await query<{ latest_deploy_id: string; latest_deploy_status: string }>(
      handle,
      `select latest_deploy_id, latest_deploy_status from apps where id = '22222222-2222-2222-2222-222222222222'`,
    );
    assert.equal(rows[0]?.latest_deploy_id, '33333333-3333-3333-3333-333333333333');
    assert.equal(rows[0]?.latest_deploy_status, 'building');
  } finally {
    await handle.close();
  }
});

test('sync_app_latest_deploy trigger: same-row retry updates status (needs_secrets → building → success)', async () => {
  const handle = await freshDb();
  try {
    await query(
      handle,
      `insert into users (id, email, username) values ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'alice')`,
    );
    await query(
      handle,
      `insert into apps (id, slug, name, type, category, source_type, maker_id)
       values ('22222222-2222-2222-2222-222222222222', 'recipes', 'Recipes', 'app', 'food_and_drink', 'zip', '11111111-1111-1111-1111-111111111111')`,
    );
    await query(
      handle,
      `insert into deploys (id, app_id, version, source_type, status)
       values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 1, 'zip', 'building')`,
    );

    // Transition 1: building → needs_secrets (Functions bundle needs env vars)
    await query(
      handle,
      `update deploys set status = 'needs_secrets' where id = '33333333-3333-3333-3333-333333333333'`,
    );
    let rows = await query<{ latest_deploy_status: string }>(
      handle,
      `select latest_deploy_status from apps where id = '22222222-2222-2222-2222-222222222222'`,
    );
    assert.equal(
      rows[0]?.latest_deploy_status,
      'needs_secrets',
      'latest_deploy_status must update on same-row transition to needs_secrets',
    );

    // Transition 2: needs_secrets → building (maker set secrets, resume same deploy row)
    await query(
      handle,
      `update deploys set status = 'building' where id = '33333333-3333-3333-3333-333333333333'`,
    );
    rows = await query<{ latest_deploy_status: string }>(
      handle,
      `select latest_deploy_status from apps where id = '22222222-2222-2222-2222-222222222222'`,
    );
    assert.equal(rows[0]?.latest_deploy_status, 'building');

    // Transition 3: building → success
    await query(
      handle,
      `update deploys set status = 'success' where id = '33333333-3333-3333-3333-333333333333'`,
    );
    rows = await query<{ latest_deploy_status: string }>(
      handle,
      `select latest_deploy_status from apps where id = '22222222-2222-2222-2222-222222222222'`,
    );
    assert.equal(
      rows[0]?.latest_deploy_status,
      'success',
      'latest_deploy_status must update on same-row transition to success',
    );
  } finally {
    await handle.close();
  }
});

test('sync_app_latest_deploy trigger: newer version supersedes older', async () => {
  const handle = await freshDb();
  try {
    await query(
      handle,
      `insert into users (id, email, username) values ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'alice')`,
    );
    await query(
      handle,
      `insert into apps (id, slug, name, type, category, source_type, maker_id)
       values ('22222222-2222-2222-2222-222222222222', 'recipes', 'Recipes', 'app', 'food_and_drink', 'zip', '11111111-1111-1111-1111-111111111111')`,
    );

    // v1 success
    await query(
      handle,
      `insert into deploys (id, app_id, version, source_type, status)
       values ('aaaa1111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 1, 'zip', 'success')`,
    );

    // v2 inserted in building state — should become latest immediately
    await query(
      handle,
      `insert into deploys (id, app_id, version, source_type, status)
       values ('bbbb2222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 2, 'zip', 'building')`,
    );

    const rows = await query<{ latest_deploy_id: string; latest_deploy_status: string }>(
      handle,
      `select latest_deploy_id, latest_deploy_status from apps where id = '22222222-2222-2222-2222-222222222222'`,
    );
    assert.equal(rows[0]?.latest_deploy_id, 'bbbb2222-2222-2222-2222-222222222222');
    assert.equal(rows[0]?.latest_deploy_status, 'building');
  } finally {
    await handle.close();
  }
});

test('sync_app_latest_deploy trigger: failed status reflected in latest_*', async () => {
  const handle = await freshDb();
  try {
    await query(
      handle,
      `insert into users (id, email, username) values ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'alice')`,
    );
    await query(
      handle,
      `insert into apps (id, slug, name, type, category, source_type, maker_id)
       values ('22222222-2222-2222-2222-222222222222', 'recipes', 'Recipes', 'app', 'food_and_drink', 'zip', '11111111-1111-1111-1111-111111111111')`,
    );
    await query(
      handle,
      `insert into deploys (id, app_id, version, source_type, status)
       values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 1, 'zip', 'building')`,
    );
    await query(
      handle,
      `update deploys set status = 'failed', error_message = 'preflight blocked' where id = '33333333-3333-3333-3333-333333333333'`,
    );

    const rows = await query<{ latest_deploy_status: string }>(
      handle,
      `select latest_deploy_status from apps where id = '22222222-2222-2222-2222-222222222222'`,
    );
    assert.equal(rows[0]?.latest_deploy_status, 'failed');
  } finally {
    await handle.close();
  }
});

test('apps deploy_status check constraint rejects invalid statuses', async () => {
  const handle = await freshDb();
  try {
    await query(
      handle,
      `insert into users (id, email, username) values ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'alice')`,
    );
    await query(
      handle,
      `insert into apps (id, slug, name, type, category, source_type, maker_id)
       values ('22222222-2222-2222-2222-222222222222', 'recipes', 'Recipes', 'app', 'food_and_drink', 'zip', '11111111-1111-1111-1111-111111111111')`,
    );

    await assert.rejects(
      async () =>
        query(
          handle,
          `insert into deploys (id, app_id, version, source_type, status)
           values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 1, 'zip', 'invalid_state')`,
        ),
      /check constraint|invalid input/i,
      'deploys.status must reject unknown values',
    );
  } finally {
    await handle.close();
  }
});

test('reserved_slugs primary key prevents duplicate slug claim', async () => {
  const handle = await freshDb();
  try {
    await assert.rejects(
      async () => query(handle, `insert into reserved_slugs (slug, reason) values ('shippie', 'system')`),
      /duplicate|unique|conflict/i,
    );
  } finally {
    await handle.close();
  }
});

test('apps slug uniqueness enforced', async () => {
  const handle = await freshDb();
  try {
    await query(
      handle,
      `insert into users (id, email, username) values ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'alice')`,
    );
    await query(
      handle,
      `insert into apps (id, slug, name, type, category, source_type, maker_id)
       values ('22222222-2222-2222-2222-222222222222', 'recipes', 'Recipes', 'app', 'food_and_drink', 'zip', '11111111-1111-1111-1111-111111111111')`,
    );
    await assert.rejects(
      async () =>
        query(
          handle,
          `insert into apps (id, slug, name, type, category, source_type, maker_id)
           values ('33333333-3333-3333-3333-333333333333', 'recipes', 'Duplicate', 'app', 'food_and_drink', 'zip', '11111111-1111-1111-1111-111111111111')`,
        ),
      /duplicate|unique/i,
    );
  } finally {
    await handle.close();
  }
});

test('apps FTS tsvector populates from name/tagline/description', async () => {
  const handle = await freshDb();
  try {
    await query(
      handle,
      `insert into users (id, email, username) values ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'alice')`,
    );
    await query(
      handle,
      `insert into apps (id, slug, name, tagline, description, type, category, source_type, maker_id)
       values ('22222222-2222-2222-2222-222222222222', 'recipes', 'Recipes', 'Save your favorites', 'A simple recipe manager', 'app', 'food_and_drink', 'zip', '11111111-1111-1111-1111-111111111111')`,
    );

    const rows = await query<{ slug: string }>(
      handle,
      `select slug from apps where fts @@ to_tsquery('english', 'recipe')`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.slug, 'recipes');
  } finally {
    await handle.close();
  }
});
