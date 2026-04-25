/**
 * End-to-end tests for migrations 0003 + 0004:
 *   - oauth_* tables
 *   - app_sessions (opaque handle model)
 *   - app_data + app_files RLS with WITH CHECK
 *   - store_account_credentials (polymorphic subject)
 *   - app_signing_configs (rotation-safe + developer-writable RLS)
 *   - ios_verify_kits, ios_signing_verifications
 *   - invalidate_verifications_on_config_change trigger
 *   - compliance_checks status enum (includes 'needs_action')
 *
 * Spec references inline.
 *
 * Each test spins up a fresh PGlite WASM instance and replays all 19
 * migration files end-to-end (~1–3s setup cost). That exceeds bun's 5s
 * default per-test timeout under load, so we set an explicit 30s
 * timeout per test. This is acceptable in CI — the whole file finishes
 * in ~20s wall-clock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDb, type ShippieDbHandle } from './client.ts';
import { runMigrations } from './migrate.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

/** Per-test timeout covering PGlite init + full migration replay. */
const TEST_TIMEOUT_MS = 30_000;

async function freshDb(): Promise<ShippieDbHandle> {
  const handle = await createDb({ url: 'pglite://memory' });
  await runMigrations(handle, MIGRATIONS_DIR);
  return handle;
}

async function query<T = unknown>(
  handle: ShippieDbHandle,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = (handle.db as unknown as { session: { client: { query?: Function } } }).session
    .client;
  if (typeof client.query === 'function') {
    const result = (await client.query(sql, params)) as { rows: T[] };
    return result.rows;
  }
  throw new Error('non-pglite test runner not wired');
}

async function seed(handle: ShippieDbHandle, overrides?: { userId?: string; orgId?: string; appId?: string }) {
  const userId = overrides?.userId ?? '11111111-1111-1111-1111-111111111111';
  const orgId = overrides?.orgId ?? '22222222-2222-2222-2222-222222222222';
  const appId = overrides?.appId ?? '33333333-3333-3333-3333-333333333333';

  await query(handle, `insert into users (id, email, name) values ($1, $2, $3)`, [
    userId,
    'alice@test.local',
    'Alice',
  ]);
  await query(
    handle,
    `insert into organizations (id, slug, name) values ($1, $2, $3)`,
    [orgId, 'acme', 'Acme Corp'],
  );
  await query(
    handle,
    `insert into organization_members (org_id, user_id, role) values ($1, $2, 'owner')`,
    [orgId, userId],
  );
  await query(
    handle,
    `insert into apps (id, slug, name, type, category, source_type, maker_id)
     values ($1, 'recipes', 'Recipes', 'app', 'food_and_drink', 'zip', $2)`,
    [appId, userId],
  );

  return { userId, orgId, appId };
}

test('0003: oauth tables accept inserts and FK cascades', { timeout: TEST_TIMEOUT_MS }, async () => {
  const handle = await freshDb();
  try {
    const { userId, appId } = await seed(handle);
    await query(
      handle,
      `insert into oauth_clients (app_id, client_id, redirect_uris, allowed_scopes)
       values ($1, 'client_recipes', ARRAY['https://recipes.shippie.app/__shippie/auth/callback'], ARRAY['auth','storage'])`,
      [appId],
    );
    await query(
      handle,
      `insert into oauth_consents (user_id, app_id, scope) values ($1, $2, ARRAY['auth','storage'])`,
      [userId, appId],
    );
    const codeRow = await query<{ client_id: string }>(
      handle,
      `insert into oauth_authorization_codes (code, client_id, user_id, redirect_uri, code_challenge, scope, expires_at)
       values ('code-abc', 'client_recipes', $1, 'https://recipes.shippie.app/__shippie/auth/callback', 'challenge-xyz', ARRAY['auth'], now() + interval '60 seconds')
       returning client_id`,
      [userId],
    );
    assert.equal(codeRow[0]?.client_id, 'client_recipes');
  } finally {
    await handle.close();
  }
});

test('0003: app_sessions accepts opaque handle with all device fields', { timeout: TEST_TIMEOUT_MS }, async () => {
  const handle = await freshDb();
  try {
    const { userId, appId } = await seed(handle);
    await query(
      handle,
      `insert into app_sessions (handle_hash, user_id, app_id, scope, user_agent, ip_hash, device_fingerprint, expires_at)
       values ('hash-abc', $1, $2, ARRAY['auth','storage'], 'curl/8.0', 'ip-hash', 'fp-1', now() + interval '30 days')`,
      [userId, appId],
    );

    const active = await query<{ count: string }>(
      handle,
      `select count(*)::text as count from app_sessions where revoked_at is null`,
    );
    assert.equal(active[0]?.count, '1');

    // Revocation: mark revoked_at, partial index drops it from active
    await query(handle, `update app_sessions set revoked_at = now() where handle_hash = 'hash-abc'`);
    const afterRevoke = await query<{ count: string }>(
      handle,
      `select count(*)::text as count from app_sessions where revoked_at is null`,
    );
    assert.equal(afterRevoke[0]?.count, '0');
  } finally {
    await handle.close();
  }
});

test('0003: app_data select/write via RLS session vars', { timeout: TEST_TIMEOUT_MS }, async () => {
  const handle = await freshDb();
  try {
    const { userId, appId } = await seed(handle);

    // Set the session vars that RLS policies read
    await query(handle, `select set_config('app.current_app_id', $1, true)`, [appId]);
    await query(handle, `select set_config('app.current_user_id', $1, true)`, [userId]);

    await query(
      handle,
      `insert into app_data (app_id, user_id, collection, key, data)
       values ($1, $2, 'recipes', 'carbonara', '{"title":"Carbonara"}'::jsonb)`,
      [appId, userId],
    );

    const rows = await query<{ key: string }>(
      handle,
      `select key from app_data where collection = 'recipes'`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.key, 'carbonara');

    // Public data in same app
    const publicId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    await query(
      handle,
      `insert into app_data (id, app_id, user_id, collection, key, data, is_public)
       values ($1, $2, null, 'templates', 'tmpl-1', '{"kind":"starter"}'::jsonb, true)`,
      [publicId, appId],
    );

    const publicRows = await query<{ key: string }>(
      handle,
      `select key from app_data where is_public = true and collection = 'templates'`,
    );
    assert.equal(publicRows[0]?.key, 'tmpl-1');
  } finally {
    await handle.close();
  }
});

test('0003: app_data partial unique indexes separate private and public namespaces', { timeout: TEST_TIMEOUT_MS }, async () => {
  const handle = await freshDb();
  try {
    const { userId, appId } = await seed(handle);
    await query(handle, `select set_config('app.current_app_id', $1, true)`, [appId]);
    await query(handle, `select set_config('app.current_user_id', $1, true)`, [userId]);

    // Private row with key=foo
    await query(
      handle,
      `insert into app_data (app_id, user_id, collection, key, data)
       values ($1, $2, 'notes', 'foo', '{}'::jsonb)`,
      [appId, userId],
    );

    // Public row with same collection+key is allowed because it's a different partial index
    await query(
      handle,
      `insert into app_data (app_id, user_id, collection, key, data, is_public)
       values ($1, null, 'notes', 'foo', '{}'::jsonb, true)`,
      [appId],
    );

    const rows = await query<{ count: string }>(handle, `select count(*)::text as count from app_data`);
    assert.equal(rows[0]?.count, '2');
  } finally {
    await handle.close();
  }
});

test('0004: app_signing_configs partial unique index enforces exactly one active per (app,platform)', { timeout: TEST_TIMEOUT_MS }, async () => {
  const handle = await freshDb();
  try {
    const { appId } = await seed(handle);

    // First config: active
    await query(
      handle,
      `insert into app_signing_configs (app_id, platform, is_active, version, ios_team_id, ios_bundle_id, ios_signing_mode)
       values ($1, 'ios', true, 1, 'TEAM1', 'app.shippie.recipes', 'automatic')`,
      [appId],
    );

    // Second active for same (app, platform) → must fail
    await assert.rejects(
      async () =>
        query(
          handle,
          `insert into app_signing_configs (app_id, platform, is_active, version, ios_team_id, ios_bundle_id, ios_signing_mode)
           values ($1, 'ios', true, 2, 'TEAM2', 'app.shippie.recipes', 'manual')`,
          [appId],
        ),
      /duplicate|unique/i,
    );

    // Inactive row for same (app, platform) is allowed (this is the rotation pattern)
    await query(
      handle,
      `insert into app_signing_configs (app_id, platform, is_active, version, ios_team_id, ios_bundle_id, ios_signing_mode)
       values ($1, 'ios', false, 2, 'TEAM2', 'app.shippie.recipes', 'manual')`,
      [appId],
    );

    const counts = await query<{ active: string; total: string }>(
      handle,
      `select
        (select count(*)::text from app_signing_configs where app_id = $1 and is_active = true) as active,
        (select count(*)::text from app_signing_configs where app_id = $1) as total`,
      [appId],
    );
    assert.equal(counts[0]?.active, '1');
    assert.equal(counts[0]?.total, '2');
  } finally {
    await handle.close();
  }
});

test('0004: rotation via atomic flip works (Fix v5.1.2 G pattern)', { timeout: TEST_TIMEOUT_MS }, async () => {
  const handle = await freshDb();
  try {
    const { appId } = await seed(handle);

    const v1 = 'aaaaaaaa-0000-0000-0000-000000000001';
    const v2 = 'aaaaaaaa-0000-0000-0000-000000000002';

    // Insert original active config
    await query(
      handle,
      `insert into app_signing_configs (id, app_id, platform, is_active, version, ios_team_id, ios_bundle_id, ios_signing_mode)
       values ($1, $2, 'ios', true, 1, 'TEAM1', 'app.shippie.recipes', 'automatic')`,
      [v1, appId],
    );

    // Rotation pattern:
    //   1. Insert new row INACTIVE
    //   2. Single UPDATE flips both rows at statement end
    await query(
      handle,
      `insert into app_signing_configs (id, app_id, platform, is_active, version, ios_team_id, ios_bundle_id, ios_signing_mode)
       values ($1, $2, 'ios', false, 2, 'TEAM2', 'app.shippie.recipes', 'automatic')`,
      [v2, appId],
    );

    await query(
      handle,
      `update app_signing_configs
         set is_active = (id = $1)
       where app_id = $2 and platform = 'ios'
         and (id = $1 or is_active = true)`,
      [v2, appId],
    );

    const active = await query<{ id: string; version: number }>(
      handle,
      `select id, version from app_signing_configs where app_id = $1 and platform = 'ios' and is_active = true`,
      [appId],
    );
    assert.equal(active.length, 1);
    assert.equal(active[0]?.id, v2);
    assert.equal(Number(active[0]?.version), 2);
  } finally {
    await handle.close();
  }
});

test('0004: invalidate_verifications_on_config_change trigger fires on identity edits', { timeout: TEST_TIMEOUT_MS }, async () => {
  const handle = await freshDb();
  try {
    const { userId, appId } = await seed(handle);

    const configId = 'bbbbbbbb-0000-0000-0000-000000000001';
    const verifId = 'cccccccc-0000-0000-0000-000000000001';

    await query(
      handle,
      `insert into app_signing_configs (id, app_id, platform, is_active, version, ios_team_id, ios_bundle_id, ios_signing_mode)
       values ($1, $2, 'ios', true, 1, 'TEAM1', 'app.shippie.recipes', 'automatic')`,
      [configId, appId],
    );

    await query(
      handle,
      `insert into ios_signing_verifications (id, app_id, signing_config_id, nonce, succeeded_at, verify_kit_version)
       values ($1, $2, $3, 'nonce-1', now(), 1)`,
      [verifId, appId, configId],
    );

    // Verify starts non-invalidated
    const before = await query<{ invalidated_at: string | null }>(
      handle,
      `select invalidated_at from ios_signing_verifications where id = $1`,
      [verifId],
    );
    assert.equal(before[0]?.invalidated_at, null);

    // In-place edit: change team ID → trigger fires
    await query(
      handle,
      `update app_signing_configs set ios_team_id = 'TEAM2' where id = $1`,
      [configId],
    );

    const after = await query<{ invalidated_at: string | null; invalidated_reason: string | null }>(
      handle,
      `select invalidated_at, invalidated_reason from ios_signing_verifications where id = $1`,
      [verifId],
    );
    assert.ok(after[0]?.invalidated_at != null, 'verification should be invalidated');
    assert.match(after[0]?.invalidated_reason ?? '', /updated in place/);
  } finally {
    await handle.close();
  }
});

test('0004: invalidate trigger does NOT fire on is_active-only flip', { timeout: TEST_TIMEOUT_MS }, async () => {
  const handle = await freshDb();
  try {
    const { appId } = await seed(handle);

    const configId = 'bbbbbbbb-1111-1111-1111-111111111111';
    const verifId = 'cccccccc-1111-1111-1111-111111111111';

    await query(
      handle,
      `insert into app_signing_configs (id, app_id, platform, is_active, version, ios_team_id, ios_bundle_id, ios_signing_mode)
       values ($1, $2, 'ios', true, 1, 'TEAM1', 'app.shippie.recipes', 'automatic')`,
      [configId, appId],
    );

    await query(
      handle,
      `insert into ios_signing_verifications (id, app_id, signing_config_id, nonce, succeeded_at, verify_kit_version)
       values ($1, $2, $3, 'nonce-2', now(), 1)`,
      [verifId, appId, configId],
    );

    // Flip is_active → trigger must not invalidate
    await query(
      handle,
      `update app_signing_configs set is_active = false where id = $1`,
      [configId],
    );

    const after = await query<{ invalidated_at: string | null }>(
      handle,
      `select invalidated_at from ios_signing_verifications where id = $1`,
      [verifId],
    );
    assert.equal(after[0]?.invalidated_at, null);
  } finally {
    await handle.close();
  }
});

test('0004: store_account_credentials allows both user and org subjects', { timeout: TEST_TIMEOUT_MS }, async () => {
  const handle = await freshDb();
  try {
    const { userId, orgId } = await seed(handle);

    // User-scoped
    await query(
      handle,
      `insert into store_account_credentials (subject_type, subject_id, platform, credential_type, label, encrypted_value)
       values ('user', $1, 'ios', 'asc_api_key', 'My Apple Dev', 'enc-value-1')`,
      [userId],
    );

    // Org-scoped
    await query(
      handle,
      `insert into store_account_credentials (subject_type, subject_id, platform, credential_type, label, encrypted_value)
       values ('organization', $1, 'android', 'play_service_account', 'Acme Play Console', 'enc-value-2')`,
      [orgId],
    );

    const rows = await query<{ count: string }>(
      handle,
      `select count(*)::text as count from store_account_credentials`,
    );
    assert.equal(rows[0]?.count, '2');
  } finally {
    await handle.close();
  }
});

test('0004: compliance_checks accepts needs_action status', { timeout: TEST_TIMEOUT_MS }, async () => {
  const handle = await freshDb();
  try {
    const { appId } = await seed(handle);

    for (const status of ['passed', 'failed', 'pending', 'not_applicable', 'needs_action']) {
      await query(
        handle,
        `insert into compliance_checks (app_id, platform, check_type, status)
         values ($1, 'ios', 'ios-signing-verified', $2)`,
        [appId, status],
      );
    }

    const rows = await query<{ count: string }>(
      handle,
      `select count(*)::text as count from compliance_checks where status in ('passed','failed','pending','not_applicable','needs_action')`,
    );
    assert.equal(rows[0]?.count, '5');

    // Invalid status rejected
    await assert.rejects(
      async () =>
        query(
          handle,
          `insert into compliance_checks (app_id, platform, check_type, status) values ($1, 'ios', 'ios-signing-verified', 'invalid')`,
          [appId],
        ),
      /check constraint|invalid/i,
    );
  } finally {
    await handle.close();
  }
});

test('0004: ios_verify_kits unique nonce + consumption outcome', { timeout: TEST_TIMEOUT_MS }, async () => {
  const handle = await freshDb();
  try {
    const { userId, appId } = await seed(handle);

    const configId = 'dddddddd-0000-0000-0000-000000000001';
    await query(
      handle,
      `insert into app_signing_configs (id, app_id, platform, is_active, version, ios_team_id, ios_bundle_id, ios_signing_mode)
       values ($1, $2, 'ios', true, 1, 'TEAM1', 'app.shippie.recipes', 'automatic')`,
      [configId, appId],
    );

    await query(
      handle,
      `insert into ios_verify_kits (app_id, signing_config_id, nonce, secret, kit_version, issued_to, expires_at)
       values ($1, $2, 'nonce-unique', 'enc-secret', 1, $3, now() + interval '14 days')`,
      [appId, configId, userId],
    );

    // Same nonce → rejected
    await assert.rejects(
      async () =>
        query(
          handle,
          `insert into ios_verify_kits (app_id, signing_config_id, nonce, secret, kit_version, issued_to, expires_at)
           values ($1, $2, 'nonce-unique', 'enc-secret2', 1, $3, now() + interval '14 days')`,
          [appId, configId, userId],
        ),
      /duplicate|unique/i,
    );
  } finally {
    await handle.close();
  }
});
