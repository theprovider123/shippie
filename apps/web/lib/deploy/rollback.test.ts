/**
 * Integration test for the rollback library.
 *
 * Same PGlite + tempdir KV harness as reconcile-kv.test.ts. Exercises
 * the explicit-version path, the "previous" path, and every refusal
 * reason that rollbackApp can return.
 */
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { createDb, runMigrations, schema, type ShippieDbHandle } from '@shippie/db';
import { DevKv } from '@shippie/dev-storage';
import { rollbackApp } from './rollback.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', '..', 'packages', 'db', 'migrations');

// Shared PGlite instance across all tests in this file. Running a
// fresh migration pass per test was fine in isolation but starved under
// parallel load when multiple PGlite-backed files run concurrently.
let sharedHandle: ShippieDbHandle | null = null;

async function getSharedHandle(): Promise<ShippieDbHandle> {
  if (sharedHandle) return sharedHandle;
  sharedHandle = await createDb({ url: 'pglite://memory' });
  await runMigrations(sharedHandle, MIGRATIONS_DIR);
  return sharedHandle;
}

async function truncateAll(handle: ShippieDbHandle): Promise<void> {
  // Truncate the tables this test touches. Cascade handles FKs to
  // deploys/apps/users/audit_log.
  await handle.db.execute(sql`TRUNCATE TABLE audit_log, deploys, apps, users RESTART IDENTITY CASCADE`);
}

interface Fixture {
  handle: ShippieDbHandle;
  kv: DevKv;
  kvDir: string;
  userId: string;
  otherUserId: string;
  appId: string;
  slug: string;
  v1: string;
  v2: string;
  v3: string;
  vFailedId: string;
}

let fx: Fixture;

async function seed(): Promise<Fixture> {
  const handle = await getSharedHandle();
  await truncateAll(handle);
  const db = handle.db;

  const [user] = await db
    .insert(schema.users)
    .values({ email: 'maker@example.com' })
    .returning();
  const [other] = await db
    .insert(schema.users)
    .values({ email: 'other@example.com' })
    .returning();

  const [app] = await db
    .insert(schema.apps)
    .values({
      slug: 'rollback-test',
      name: 'Rollback Test',
      type: 'app',
      category: 'utility',
      sourceType: 'zip',
      makerId: user!.id,
    })
    .returning();

  const insertDeploy = async (
    version: number,
    status = 'success',
    cspHeader: string | null = null,
  ) => {
    const [row] = await db
      .insert(schema.deploys)
      .values({
        appId: app!.id,
        version,
        sourceType: 'zip',
        status,
        cspHeader,
      })
      .returning();
    return row!.id;
  };

  // v1 + v2 have stored CSP (post-0014 behavior); v3 does not (simulates
  // a deploy built before the migration landed).
  const v1 = await insertDeploy(1, 'success', "default-src 'self' https://v1.supabase.co");
  const v2 = await insertDeploy(2, 'success', "default-src 'self' https://v2.supabase.co");
  const v3 = await insertDeploy(3, 'success', null);
  const vFailed = await insertDeploy(4, 'failed');

  // Current active: v3
  await db
    .update(schema.apps)
    .set({ activeDeployId: v3 })
    .where(eq(schema.apps.id, app!.id));

  const kvDir = mkdtempSync(join(tmpdir(), 'shippie-rollback-'));
  const kv = new DevKv(kvDir);
  await kv.put(`apps:${app!.slug}:active`, '3');

  return {
    handle,
    kv,
    kvDir,
    userId: user!.id,
    otherUserId: other!.id,
    appId: app!.id,
    slug: app!.slug,
    v1,
    v2,
    v3,
    vFailedId: vFailed,
  };
}

beforeEach(async () => {
  fx = await seed();
});

afterEach(() => {
  // Only clean up the tempdir. The shared DB handle is closed in `after`.
  rmSync(fx.kvDir, { recursive: true, force: true });
});

after(async () => {
  if (sharedHandle) {
    await sharedHandle.close().catch(() => {});
    sharedHandle = null;
  }
});

test('rolls back to an explicit prior version and rewrites stored CSP', async () => {
  const res = await rollbackApp({
    slug: fx.slug,
    actorUserId: fx.userId,
    targetVersion: 1,
    db: fx.handle.db,
    kv: fx.kv,
  });
  assert.equal(res.success, true);
  if (res.success) {
    assert.equal(res.from_version, 3);
    assert.equal(res.to_version, 1);
    assert.equal(res.deploy_id, fx.v1);
    assert.equal(res.csp_stale, false); // v1 has stored CSP
  }
  assert.equal(await fx.kv.get(`apps:${fx.slug}:active`), '1');
  assert.equal(
    await fx.kv.get(`apps:${fx.slug}:csp`),
    "default-src 'self' https://v1.supabase.co",
  );

  const app = await fx.handle.db.query.apps.findFirst({
    where: eq(schema.apps.id, fx.appId),
  });
  assert.equal(app?.activeDeployId, fx.v1);
});

test('leaves CSP untouched and flags csp_stale when target has no stored CSP', async () => {
  // Set an initial KV csp so we can detect whether it gets overwritten
  await fx.kv.put(`apps:${fx.slug}:csp`, 'pre-existing-csp-from-current');

  // v3 is currently active; roll back to v3's own value is a no-op
  // (already_active), so roll back to a non-CSP deploy by making v1
  // the only lower candidate — but v1 has CSP. Need a deploy with
  // no stored CSP below current. Use explicit targetVersion=3 is
  // already_active — instead, make the current v2 (has CSP) and
  // target v3 (no CSP) by repointing active.
  await fx.handle.db
    .update(schema.apps)
    .set({ activeDeployId: fx.v2 })
    .where(eq(schema.apps.id, fx.appId));

  const res = await rollbackApp({
    slug: fx.slug,
    actorUserId: fx.userId,
    targetVersion: 3,
    db: fx.handle.db,
    kv: fx.kv,
  });
  // v3 > v2, so this is a "roll forward", but targetVersion doesn't
  // require the target be older — it just requires it be different.
  assert.equal(res.success, true);
  if (res.success) {
    assert.equal(res.csp_stale, true);
  }
  assert.equal(await fx.kv.get(`apps:${fx.slug}:csp`), 'pre-existing-csp-from-current');
});

test('rolls back to "previous" = the successful deploy just below current active', async () => {
  const res = await rollbackApp({
    slug: fx.slug,
    actorUserId: fx.userId,
    to: 'previous',
    db: fx.handle.db,
    kv: fx.kv,
  });
  assert.equal(res.success, true);
  if (res.success) {
    assert.equal(res.from_version, 3);
    assert.equal(res.to_version, 2); // the failed v4 is skipped; highest < 3 successful is v2
  }
});

test('refuses when rollback target equals current active', async () => {
  const res = await rollbackApp({
    slug: fx.slug,
    actorUserId: fx.userId,
    targetVersion: 3,
    db: fx.handle.db,
    kv: fx.kv,
  });
  assert.equal(res.success, false);
  if (!res.success) assert.equal(res.reason, 'already_active');
});

test('refuses unknown version', async () => {
  const res = await rollbackApp({
    slug: fx.slug,
    actorUserId: fx.userId,
    targetVersion: 999,
    db: fx.handle.db,
    kv: fx.kv,
  });
  assert.equal(res.success, false);
  if (!res.success) assert.equal(res.reason, 'version_not_found');
});

test('refuses rollback to a failed deploy', async () => {
  const res = await rollbackApp({
    slug: fx.slug,
    actorUserId: fx.userId,
    targetVersion: 4,
    db: fx.handle.db,
    kv: fx.kv,
  });
  assert.equal(res.success, false);
  if (!res.success) assert.equal(res.reason, 'version_not_successful');
});

test('refuses when caller is not the maker', async () => {
  const res = await rollbackApp({
    slug: fx.slug,
    actorUserId: fx.otherUserId,
    targetVersion: 1,
    db: fx.handle.db,
    kv: fx.kv,
  });
  assert.equal(res.success, false);
  if (!res.success) assert.equal(res.reason, 'forbidden');
});

test('refuses when app does not exist', async () => {
  const res = await rollbackApp({
    slug: 'does-not-exist',
    actorUserId: fx.userId,
    targetVersion: 1,
    db: fx.handle.db,
    kv: fx.kv,
  });
  assert.equal(res.success, false);
  if (!res.success) assert.equal(res.reason, 'app_not_found');
});

test('refuses "previous" when there is nothing older than current', async () => {
  // Move active to v1 — nothing below
  await fx.handle.db
    .update(schema.apps)
    .set({ activeDeployId: fx.v1 })
    .where(eq(schema.apps.id, fx.appId));
  await fx.kv.put(`apps:${fx.slug}:active`, '1');

  const res = await rollbackApp({
    slug: fx.slug,
    actorUserId: fx.userId,
    to: 'previous',
    db: fx.handle.db,
    kv: fx.kv,
  });
  assert.equal(res.success, false);
  if (!res.success) assert.equal(res.reason, 'no_previous_deploy');
});

test('writes an audit log entry on success', async () => {
  await rollbackApp({
    slug: fx.slug,
    actorUserId: fx.userId,
    targetVersion: 2,
    db: fx.handle.db,
    kv: fx.kv,
  });
  const entries = await fx.handle.db.query.auditLog.findMany({
    where: eq(schema.auditLog.targetId, fx.appId),
  });
  const rollback = entries.find((e: { action: string }) => e.action === 'app.rollback');
  assert.ok(rollback, 'audit log entry should exist');
  assert.equal(rollback!.actorUserId, fx.userId);
});
