import { describe, expect, test } from 'bun:test';
import { createMemoryLocalDb } from './memory.ts';

describe('@shippie/local-db memory adapter', () => {
  test('supports create/insert/query/update/delete/count/search', async () => {
    const db = createMemoryLocalDb({ appId: 'recipes', quotaBytes: 10_000 });
    await db.create('recipes', {
      id: 'text primary key',
      title: 'text',
      cuisine: 'text',
      rating: 'integer',
      embedding: 'blob',
    });
    await db.insert('recipes', {
      id: '1',
      title: 'Carbonara',
      cuisine: 'italian',
      rating: 5,
      embedding: [1, 0],
    });
    await db.insert('recipes', {
      id: '2',
      title: 'Tacos',
      cuisine: 'mexican',
      rating: 4,
      embedding: [0, 1],
    });

    expect(await db.count('recipes')).toBe(2);
    expect((await db.query('recipes', { where: { cuisine: 'italian' } }))[0]?.title).toBe('Carbonara');
    expect((await db.search('recipes', 'taco'))[0]?.id).toBe('2');
    expect((await db.vectorSearch('recipes', new Float32Array([1, 0]), { limit: 1 }))[0]?.id).toBe('1');

    await db.update('recipes', '2', { rating: 5 });
    expect((await db.query('recipes', { where: { id: '2' } }))[0]?.rating).toBe(5);
    await db.delete('recipes', '1');
    expect(await db.count('recipes')).toBe(1);
    expect((await db.usage()).usedBytes).toBeGreaterThan(0);
  });

  test('exports and restores encrypted backups', async () => {
    const db = createMemoryLocalDb({ appId: 'recipes', schemaVersion: 3 });
    await db.create('recipes', { id: 'text primary key', title: 'text' });
    await db.insert('recipes', { id: '1', title: 'Carbonara' });

    const backup = await db.export('recipes', { format: 'shippiebak', passphrase: 'secret' });
    const info = await db.lastBackup();
    expect(info?.appId).toBe('recipes');
    expect(info?.schemaVersion).toBe(3);

    const restored = createMemoryLocalDb();
    const dryRun = await restored.restore(backup, { passphrase: 'secret', dryRun: true });
    expect(dryRun.tables).toEqual(['recipes']);
    await restored.restore(backup, { passphrase: 'secret' });
    expect((await restored.query('recipes'))[0]?.title).toBe('Carbonara');
  });
});
