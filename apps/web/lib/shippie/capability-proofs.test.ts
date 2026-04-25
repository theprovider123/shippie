import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { schema, type ShippieDbHandle } from '@shippie/db';
import { eq } from 'drizzle-orm';
import { setupPgliteForTest, teardownPglite } from '@/lib/test-helpers/pglite-harness';
import { getDb } from '@/lib/db';
import { readProvenCapabilities, readProvenCapabilitiesBatch } from './capability-proofs';
import { publicCapabilityBadges } from './capability-badges';

const APP_A = 'cap-app-a';
const APP_B = 'cap-app-b';

let handle: ShippieDbHandle | undefined;

beforeAll(async () => {
  handle = await setupPgliteForTest();
}, 30_000);

afterAll(async () => {
  await teardownPglite(handle);
});

beforeEach(async () => {
  const db = await getDb();
  await db.delete(schema.appEvents).where(eq(schema.appEvents.appId, APP_A));
  await db.delete(schema.appEvents).where(eq(schema.appEvents.appId, APP_B));
});

async function emit(appId: string, eventType: string, ts = new Date()): Promise<void> {
  const db = await getDb();
  await db.insert(schema.appEvents).values({
    appId,
    sessionId: 's-test',
    userId: null,
    eventType,
    metadata: {},
    ts,
  });
}

describe('readProvenCapabilities', () => {
  test('returns false for all when no events present', async () => {
    const db = await getDb();
    const proofs = await readProvenCapabilities(db, APP_A);
    expect(proofs).toEqual({ opfs: false, persist: false, db: false, files: false, ai: false });
  });

  test('flips db + files when those proofs land', async () => {
    await emit(APP_A, 'local.db_used');
    await emit(APP_A, 'local.files_used');
    const db = await getDb();
    const proofs = await readProvenCapabilities(db, APP_A);
    expect(proofs.db).toBe(true);
    expect(proofs.files).toBe(true);
    expect(proofs.ai).toBe(false);
  });

  test('ignores events older than the window', async () => {
    // Stay inside the seeded 2026-04 partition; use a tight window so this
    // older-but-still-partitioned event falls outside it.
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await emit(APP_A, 'local.db_used', fiveDaysAgo);
    const db = await getDb();
    const proofs = await readProvenCapabilities(db, APP_A, 1);
    expect(proofs.db).toBe(false);
  });
});

describe('readProvenCapabilitiesBatch', () => {
  test('groups proofs per appId', async () => {
    await emit(APP_A, 'local.db_used');
    await emit(APP_B, 'local.ai_model_cached');
    const db = await getDb();
    const result = await readProvenCapabilitiesBatch(db, [APP_A, APP_B]);
    expect(result.get(APP_A)?.db).toBe(true);
    expect(result.get(APP_A)?.ai).toBe(false);
    expect(result.get(APP_B)?.ai).toBe(true);
    expect(result.get(APP_B)?.db).toBe(false);
  });

  test('returns empty map for empty appIds', async () => {
    const db = await getDb();
    const result = await readProvenCapabilitiesBatch(db, []);
    expect(result.size).toBe(0);
  });
});

describe('publicCapabilityBadges with proofs', () => {
  const report = {
    wrapper_compat: {
      capability_badges: [
        { label: 'Local Database', status: 'not_tested' },
        { label: 'Local AI', status: 'not_tested' },
      ],
    },
  };

  test('flips not_tested to pass when proof exists', () => {
    const badges = publicCapabilityBadges(report, {
      opfs: true,
      persist: false,
      db: true,
      files: false,
      ai: false,
    });
    const dbBadge = badges.find((b) => b.label === 'Local Database');
    expect(dbBadge?.status).toBe('pass');
    expect(dbBadge?.proven).toBe(true);
    const aiBadge = badges.find((b) => b.label === 'Local AI');
    expect(aiBadge?.status).toBe('not_tested');
  });

  test('leaves badges unchanged when no proofs given', () => {
    const badges = publicCapabilityBadges(report);
    expect(badges.every((b) => b.status === 'not_tested')).toBe(true);
    expect(badges.every((b) => !b.proven)).toBe(true);
  });
});
