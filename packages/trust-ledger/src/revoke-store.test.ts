import { describe, expect, it, beforeEach } from 'bun:test';
import 'fake-indexeddb/auto';
import { _resetForTests, closeLedgerDb, DB_NAME } from './idb.ts';
import { openRevocationStore } from './revoke-store.ts';

beforeEach(async () => {
  closeLedgerDb();
  _resetForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  _resetForTests();
});

describe('RevocationStore', () => {
  it('isRevoked returns false for unrevoked (app, capability) pairs', async () => {
    const store = await openRevocationStore();
    expect(await store.isRevoked('recipe', 'network.fetch')).toBe(false);
  });

  it('revoke + isRevoked round-trip', async () => {
    const store = await openRevocationStore();
    await store.revoke('recipe', 'network.fetch');
    expect(await store.isRevoked('recipe', 'network.fetch')).toBe(true);
    // Scoped per-app
    expect(await store.isRevoked('journal', 'network.fetch')).toBe(false);
    expect(await store.isRevoked('recipe', 'intent.provide')).toBe(false);
  });

  it('restore removes the revocation', async () => {
    const store = await openRevocationStore();
    await store.revoke('recipe', 'network.fetch');
    await store.restore('recipe', 'network.fetch');
    expect(await store.isRevoked('recipe', 'network.fetch')).toBe(false);
  });

  it('list returns all current revocations newest-first', async () => {
    const store = await openRevocationStore();
    await store.revoke('recipe', 'network.fetch', 100);
    await store.revoke('journal', 'ai.run', 300);
    await store.revoke('recipe', 'share.send', 200);
    const all = await store.list();
    expect(all.map((r) => r.id)).toEqual([
      'journal::ai.run',
      'recipe::share.send',
      'recipe::network.fetch',
    ]);
  });

  it('clear removes every revocation', async () => {
    const store = await openRevocationStore();
    await store.revoke('recipe', 'network.fetch');
    await store.revoke('journal', 'ai.run');
    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it('opening the store twice does not error (idempotent ensureStore)', async () => {
    const first = await openRevocationStore();
    await first.revoke('recipe', 'network.fetch');
    const second = await openRevocationStore();
    expect(await second.isRevoked('recipe', 'network.fetch')).toBe(true);
  });
});
