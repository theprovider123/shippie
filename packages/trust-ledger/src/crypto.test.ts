import { describe, expect, it } from 'bun:test';
import { deriveDeviceLedgerKey, encryptRow, decryptRow } from './crypto.ts';
import type { LedgerRow } from './types.ts';

function makeRow(over: Partial<LedgerRow> = {}): LedgerRow {
  return {
    id: '01H000000000000000000000AA',
    ts: 1_700_000_000_000,
    app: 'recipe',
    capability: 'network.fetch',
    category: 'capability',
    summary: 'fetch palate.app (200)',
    target_host: 'palate.app',
    bytes_in: 4_200,
    bytes_out: 0,
    outcome: 'ok',
    ...over,
  };
}

const seed = new Uint8Array(32).fill(11);

describe('deriveDeviceLedgerKey', () => {
  it('is deterministic: same seed → same usable key', async () => {
    const k1 = await deriveDeviceLedgerKey(seed);
    const k2 = await deriveDeviceLedgerKey(seed);
    const row = makeRow();
    const e1 = await encryptRow(k1, row);
    const round = await decryptRow(k2, e1);
    expect(round).toEqual(row);
  });

  it('rejects short seeds', async () => {
    await expect(deriveDeviceLedgerKey(new Uint8Array(8))).rejects.toThrow(/seed/);
  });

  it('returns a stable key id', async () => {
    const k = await deriveDeviceLedgerKey(seed);
    expect(k.id).toBe('device-v1');
  });
});

describe('encrypt/decrypt round-trip', () => {
  it('preserves every field of the row', async () => {
    const k = await deriveDeviceLedgerKey(seed);
    const row = makeRow();
    const env = await encryptRow(k, row);
    const round = await decryptRow(k, env);
    expect(round).toEqual(row);
  });

  it('produces a fresh IV per row even for identical input', async () => {
    const k = await deriveDeviceLedgerKey(seed);
    const row = makeRow();
    const a = await encryptRow(k, row);
    const b = await encryptRow(k, row);
    expect(Array.from(a.iv)).not.toEqual(Array.from(b.iv));
    expect(Array.from(a.ciphertext)).not.toEqual(Array.from(b.ciphertext));
  });

  it('refuses to decrypt a row produced under a different key id', async () => {
    const k = await deriveDeviceLedgerKey(seed);
    const env = await encryptRow(k, makeRow());
    const mismatched = { ...env, key_id: 'device-vBOGUS' };
    await expect(decryptRow(k, mismatched)).rejects.toThrow(/key_id/);
  });

  it('encodes ts_bucket from row.ts', async () => {
    const k = await deriveDeviceLedgerKey(seed);
    const env = await encryptRow(k, makeRow({ ts: 3_600_000 * 17 + 1234 }));
    expect(env.ts_bucket).toBe(17);
  });
});
