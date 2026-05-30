import { describe, expect, it, beforeEach } from 'bun:test';
import 'fake-indexeddb/auto';
import { _resetForTests, closeLedgerDb, DB_NAME } from './idb.ts';
import { createLedger, getOrCreateDeviceSeed } from './ledger.ts';
import { deriveDeviceLedgerKey } from './crypto.ts';
import type { LedgerRow } from './types.ts';

function row(over: Partial<LedgerRow> = {}): LedgerRow {
  return {
    id: 'r-' + Math.random().toString(36).slice(2),
    ts: Date.now(),
    app: 'recipe',
    capability: 'network.fetch',
    category: 'capability',
    summary: 'fetch palate.app (200)',
    target_host: 'palate.app',
    bytes_in: 1024,
    bytes_out: 0,
    outcome: 'ok',
    ...over,
  };
}

async function freshLedger() {
  const seed = new Uint8Array(32).fill(13);
  const key = await deriveDeviceLedgerKey(seed);
  return createLedger({ key });
}

async function deleteDb(): Promise<void> {
  // Close any cached connection first so deleteDatabase doesn't block.
  closeLedgerDb();
  _resetForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  _resetForTests();
}

beforeEach(async () => {
  await deleteDb();
});

describe('Ledger commit + read round-trip', () => {
  it('commits a row and reads it back encrypted then decrypted', async () => {
    const ledger = await freshLedger();
    const r = row();
    await ledger.commit(r);
    const back = await ledger.readApp('recipe');
    expect(back).toHaveLength(1);
    expect(back[0]).toEqual(r);
  });

  it('readApp returns rows newest-first', async () => {
    const ledger = await freshLedger();
    await ledger.commit(row({ id: 'a', ts: 1000 }));
    await ledger.commit(row({ id: 'b', ts: 3000 }));
    await ledger.commit(row({ id: 'c', ts: 2000 }));
    const back = await ledger.readApp('recipe');
    expect(back.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('readApp scopes by app', async () => {
    const ledger = await freshLedger();
    await ledger.commit(row({ id: 'r1', app: 'recipe' }));
    await ledger.commit(row({ id: 'j1', app: 'journal' }));
    const recipe = await ledger.readApp('recipe');
    const journal = await ledger.readApp('journal');
    expect(recipe).toHaveLength(1);
    expect(journal).toHaveLength(1);
    expect(recipe[0]!.id).toBe('r1');
    expect(journal[0]!.id).toBe('j1');
  });

  it('readApp limit caps the result set', async () => {
    const ledger = await freshLedger();
    for (let i = 0; i < 10; i++) {
      await ledger.commit(row({ id: `r${i}`, ts: 1000 + i }));
    }
    const back = await ledger.readApp('recipe', { limit: 3 });
    expect(back).toHaveLength(3);
  });

  it('readApp since filter excludes older rows', async () => {
    const ledger = await freshLedger();
    await ledger.commit(row({ id: 'old', ts: 1000 }));
    await ledger.commit(row({ id: 'new', ts: 5000 }));
    const back = await ledger.readApp('recipe', { since: 2000 });
    expect(back.map((r) => r.id)).toEqual(['new']);
  });
});

describe('Ledger telemetry surface', () => {
  it('readTelemetry returns only telemetry-egress rows', async () => {
    const ledger = await freshLedger();
    await ledger.commit(row({ id: 'cap', capability: 'network.fetch', category: 'capability' }));
    await ledger.commit(
      row({
        id: 'tel',
        capability: 'install_a2hs_accepted',
        category: 'telemetry-egress',
        source: 'shell-analytics',
        app: '__shippie_shell__',
      }),
    );
    const t = await ledger.readTelemetry();
    expect(t.map((r) => r.id)).toEqual(['tel']);
  });

  it('readTelemetry can scope by source', async () => {
    const ledger = await freshLedger();
    await ledger.commit(
      row({
        id: 'proof',
        category: 'telemetry-egress',
        source: 'cloud-proof',
        app: '__shippie_shell__',
        capability: 'proof.emit',
        ts: 1000,
      }),
    );
    await ledger.commit(
      row({
        id: 'shell',
        category: 'telemetry-egress',
        source: 'shell-analytics',
        app: '__shippie_shell__',
        capability: 'install_a2hs_accepted',
        ts: 2000,
      }),
    );
    const proof = await ledger.readTelemetry({ sources: ['cloud-proof'] });
    expect(proof.map((r) => r.id)).toEqual(['proof']);
  });
});

describe('Ledger sweepRetention', () => {
  it('removes rows older than cutoff using the ts_bucket index', async () => {
    const ledger = await freshLedger();
    await ledger.commit(row({ id: 'old', ts: 1_000_000 })); // bucket 0
    await ledger.commit(row({ id: 'mid', ts: 3_600_000 * 5 })); // bucket 5
    await ledger.commit(row({ id: 'new', ts: 3_600_000 * 100 })); // bucket 100
    const deleted = await ledger.sweepRetention(3_600_000 * 10);
    expect(deleted).toBe(2);
    const remaining = await ledger.readApp('recipe');
    expect(remaining.map((r) => r.id)).toEqual(['new']);
  });
});

describe('Ledger exportAll + wipe', () => {
  it('exportAll returns every row newest-first', async () => {
    const ledger = await freshLedger();
    await ledger.commit(row({ id: 'a', ts: 100 }));
    await ledger.commit(row({ id: 'b', ts: 200 }));
    const all = await ledger.exportAll();
    expect(all.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('wipe deletes all rows but emits a ledger-internal row first then clears it too', async () => {
    const ledger = await freshLedger();
    await ledger.commit(row({ id: 'a' }));
    await ledger.commit(row({ id: 'b' }));
    const deleted = await ledger.wipe();
    expect(deleted).toBeGreaterThanOrEqual(2);
    const remaining = await ledger.exportAll();
    expect(remaining).toHaveLength(0);
  });
});

describe('getOrCreateDeviceSeed', () => {
  it('writes a fresh seed on first call and returns the same one on subsequent calls', async () => {
    const a = await getOrCreateDeviceSeed();
    const b = await getOrCreateDeviceSeed();
    expect(a.byteLength).toBe(32);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
