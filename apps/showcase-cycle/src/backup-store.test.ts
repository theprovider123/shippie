import { describe, expect, it } from 'bun:test';
import { MemoryLocalDb } from './db/runtime.ts';
import { createCycleBackupStore } from './backup-store.ts';
import { listCycles, listDays, logDay, startCycle } from './db/queries.ts';

const PASS = 'correct horse battery staple';

async function seed(): Promise<MemoryLocalDb> {
  const db = new MemoryLocalDb();
  const c = await startCycle(db, '2025-01-01');
  await logDay(db, { cycle_id: c.id, date: '2025-01-02', flow: 3, pain: 2, mood: 4, symptoms: ['cramps'] });
  await startCycle(db, '2025-02-01');
  return db;
}

describe('cycle encrypted backup', () => {
  it('round-trips an encrypted backup to a fresh device', async () => {
    const src = await seed();
    const blob = await createCycleBackupStore(src).exportEncrypted(PASS);
    expect(blob.size).toBeGreaterThan(0);

    const dest = new MemoryLocalDb();
    const res = await createCycleBackupStore(dest).importEncrypted(blob, PASS);
    expect(res.ok).toBe(true);

    const cycles = await listCycles(dest);
    expect(cycles).toHaveLength(2);
    const days = await listDays(dest);
    expect(days).toHaveLength(1);
    expect(days[0]!.pain).toBe(2);
    expect(days[0]!.mood).toBe(4);
  });

  it('rejects the wrong passphrase (data stays unreadable)', async () => {
    const src = await seed();
    const blob = await createCycleBackupStore(src).exportEncrypted(PASS);
    const dest = new MemoryLocalDb();
    const res = await createCycleBackupStore(dest).importEncrypted(blob, 'wrong passphrase');
    expect(res.ok).toBe(false);
    expect(await listCycles(dest)).toHaveLength(0);
  });

  it('dryRun verifies without writing', async () => {
    const src = await seed();
    const blob = await createCycleBackupStore(src).exportEncrypted(PASS);
    const dest = new MemoryLocalDb();
    const res = await createCycleBackupStore(dest).importEncrypted(blob, PASS, { dryRun: true });
    expect(res.ok).toBe(true);
    expect((res.preview as { cycles: number }).cycles).toBe(2);
    // nothing written on a dry run
    expect(await listCycles(dest)).toHaveLength(0);
  });

  it('refuses a backup from a different app', async () => {
    const dest = new MemoryLocalDb();
    const notCycle = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'application/octet-stream' });
    const res = await createCycleBackupStore(dest).importEncrypted(notCycle, PASS);
    expect(res.ok).toBe(false);
  });
});
