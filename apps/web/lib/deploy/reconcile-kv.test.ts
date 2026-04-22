/**
 * Integration test for the KV reconciliation reaper.
 *
 * Spins up a PGlite DB with the real migrations applied, a DevKv over
 * a fresh tempdir, seeds one app + one deploy, and exercises the
 * reconciliation branches: missing pointer, stale pointer, already
 * correct, and the missing-version case where the active deploy id
 * has been orphaned.
 *
 * The reconcile function accepts `db` and `kv` via options so this
 * test doesn't touch the global singleton or the on-disk `.shippie-dev-state`.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createDb, runMigrations, schema, type ShippieDbHandle } from '@shippie/db';
import { DevKv } from '@shippie/dev-storage';
import { reconcileActivePointers } from './reconcile-kv.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', '..', 'packages', 'db', 'migrations');

async function freshDb(): Promise<ShippieDbHandle> {
  const handle = await createDb({ url: 'pglite://memory' });
  await runMigrations(handle, MIGRATIONS_DIR);
  return handle;
}

interface Fixture {
  handle: ShippieDbHandle;
  kv: DevKv;
  kvDir: string;
  userId: string;
  appId: string;
  slug: string;
  deployIds: string[]; // in version order
}

let fx: Fixture;

async function seed(): Promise<Fixture> {
  const handle = await freshDb();
  const db = handle.db;

  const [user] = await db
    .insert(schema.users)
    .values({ email: 'test@example.com' })
    .returning();

  const [app] = await db
    .insert(schema.apps)
    .values({
      slug: 'reaper-test',
      name: 'Reaper Test',
      type: 'app',
      category: 'utility',
      sourceType: 'zip',
      makerId: user!.id,
    })
    .returning();

  const insertDeploy = async (version: number) => {
    const [row] = await db
      .insert(schema.deploys)
      .values({
        appId: app!.id,
        version,
        sourceType: 'zip',
        status: 'success',
      })
      .returning();
    return row!.id;
  };

  const v1 = await insertDeploy(1);
  const v2 = await insertDeploy(2);

  const kvDir = mkdtempSync(join(tmpdir(), 'shippie-reconcile-kv-'));
  const kv = new DevKv(kvDir);

  return {
    handle,
    kv,
    kvDir,
    userId: user!.id,
    appId: app!.id,
    slug: app!.slug,
    deployIds: [v1, v2],
  };
}

beforeEach(async () => {
  fx = await seed();
});

afterEach(async () => {
  await fx.handle.close();
  rmSync(fx.kvDir, { recursive: true, force: true });
});

test('apps with no activeDeployId are skipped', async () => {
  const res = await reconcileActivePointers({ db: fx.handle.db, kv: fx.kv });
  assert.equal(res.checked, 0);
  assert.deepEqual(res.updated, []);
  assert.deepEqual(res.errors, []);
});

test('writes missing active pointer from DB', async () => {
  const { eq } = await import('drizzle-orm');
  await fx.handle.db
    .update(schema.apps)
    .set({ activeDeployId: fx.deployIds[1]! })
    .where(eq(schema.apps.id, fx.appId));

  const res = await reconcileActivePointers({ db: fx.handle.db, kv: fx.kv });
  assert.equal(res.checked, 1);
  assert.deepEqual(res.updated, [fx.slug]);
  assert.equal(await fx.kv.get(`apps:${fx.slug}:active`), '2');
});

test('rewrites drifted pointer', async () => {
  const { eq } = await import('drizzle-orm');
  await fx.handle.db
    .update(schema.apps)
    .set({ activeDeployId: fx.deployIds[1]! })
    .where(eq(schema.apps.id, fx.appId));
  // KV says v1 — stale
  await fx.kv.put(`apps:${fx.slug}:active`, '1');

  const res = await reconcileActivePointers({ db: fx.handle.db, kv: fx.kv });
  assert.equal(res.checked, 1);
  assert.deepEqual(res.updated, [fx.slug]);
  assert.equal(await fx.kv.get(`apps:${fx.slug}:active`), '2');
});

test('does not touch already-correct pointer', async () => {
  const { eq } = await import('drizzle-orm');
  await fx.handle.db
    .update(schema.apps)
    .set({ activeDeployId: fx.deployIds[0]! })
    .where(eq(schema.apps.id, fx.appId));
  await fx.kv.put(`apps:${fx.slug}:active`, '1');

  const res = await reconcileActivePointers({ db: fx.handle.db, kv: fx.kv });
  assert.equal(res.checked, 1);
  assert.deepEqual(res.updated, []); // nothing to fix
  assert.equal(await fx.kv.get(`apps:${fx.slug}:active`), '1');
});

// Note: the schema enforces `apps_active_deploy_fk` on apps.activeDeployId,
// so in practice activeDeployId can't point at a non-existent deploy row —
// the missing_version code path in the reaper is defensive dead code
// unless that FK is ever relaxed or bypassed. We don't synthesize the
// scenario in tests because PGlite enforces the FK at insert time.
