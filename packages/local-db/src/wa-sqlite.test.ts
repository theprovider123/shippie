import { describe, expect, test } from 'bun:test';
import { MigrationError } from '@shippie/local-runtime-contract';
import { runLocalDbBenchmark } from './benchmark.ts';
import { createSqliteLocalDb } from './sqlite.ts';
import { createWaSqliteEngine } from './wa-sqlite.ts';

describe('@shippie/local-db wa-sqlite engine', () => {
  test('backs the Shippie local DB contract in memory', async () => {
    const engine = await createWaSqliteEngine();
    try {
      const db = createSqliteLocalDb(engine, { appId: 'recipes' });
      await db.create('recipes', {
        id: 'text primary key',
        title: 'text',
        cuisine: 'text',
        rating: 'integer',
        ingredients: 'json',
        embedding: 'blob',
      });
      await db.insert('recipes', {
        id: '1',
        title: 'Carbonara',
        cuisine: 'italian',
        rating: 5,
        ingredients: ['pasta', 'eggs'],
        embedding: [1, 0],
      });
      await db.insert('recipes', {
        id: '2',
        title: 'Tacos',
        cuisine: 'mexican',
        rating: 4,
        ingredients: ['corn'],
        embedding: [0, 1],
      });

      expect((await db.query('recipes', { where: { cuisine: 'italian' } }))[0]?.ingredients).toEqual(['pasta', 'eggs']);
      expect((await db.search('recipes', 'carbonara'))[0]?.id).toBe('1');
      expect((await db.vectorSearch('recipes', new Float32Array([0, 1]), { limit: 1 }))[0]?.id).toBe('2');
      await db.update('recipes', '2', { rating: 5 });
      expect(await db.count('recipes', { where: { rating: 5 } })).toBe(2);
    } finally {
      await engine.close();
    }
  });

  test('runs the benchmark harness against the real WASM engine', async () => {
    const engine = await createWaSqliteEngine();
    try {
      const db = createSqliteLocalDb(engine);
      const result = await runLocalDbBenchmark(db, { rowCount: 25, vectorDimensions: 4 });
      expect(result.steps.map((step) => step.name)).toContain('query');
      expect(result.steps.find((step) => step.name === 'vectorSearch')?.rows).toBe(10);
    } finally {
      await engine.close();
    }
  });

  test('uses SQLite FTS5 for search when available', async () => {
    const engine = await createWaSqliteEngine();
    try {
      const db = createSqliteLocalDb(engine);
      await db.create('recipes', {
        id: 'text primary key',
        title: 'text',
        cuisine: 'text',
        notes: 'text',
      });
      await db.insert('recipes', {
        id: '1',
        title: 'Carbonara',
        cuisine: 'italian',
        notes: 'Silky eggs and pecorino',
      });
      await db.insert('recipes', {
        id: '2',
        title: 'Cacio e pepe',
        cuisine: 'italian',
        notes: 'Pepper and cheese',
      });

      expect((await db.search('recipes', 'pecorino'))[0]?.id).toBe('1');
      await db.update('recipes', '2', { notes: 'Pepper, cheese, and pecorino' });
      expect((await db.search('recipes', 'pecorino', { orderBy: { title: 'asc' } })).map((row) => row.id)).toEqual(['2', '1']);
      await db.delete('recipes', '1');
      expect((await db.search('recipes', 'pecorino')).map((row) => row.id)).toEqual(['2']);
    } finally {
      await engine.close();
    }
  });

  test('auto-adds new columns across schema versions', async () => {
    const engine = await createWaSqliteEngine();
    try {
      const db = createSqliteLocalDb(engine, { appId: 'recipes', schemaVersion: 2 });
      await db.create('recipes', {
        id: 'text primary key',
        title: 'text',
      });
      await db.insert('recipes', {
        id: '1',
        title: 'Carbonara',
      });

      await db.create('recipes', {
        id: 'text primary key',
        title: 'text',
        cuisine: 'text',
        rating: 'integer default 0',
      });
      await db.update('recipes', '1', { cuisine: 'italian', rating: 5 });

      expect(await db.query('recipes')).toEqual([
        {
          id: '1',
          title: 'Carbonara',
          cuisine: 'italian',
          rating: 5,
        },
      ]);
      const meta = await engine.all<{ key: string; value: string }>('SELECT key, value FROM "__shippie_meta" ORDER BY key ASC');
      expect(meta.find((row) => row.key === 'appId')?.value).toBe('recipes');
      expect(meta.find((row) => row.key === 'schemaVersion')?.value).toBe('2');
    } finally {
      await engine.close();
    }
  });

  test('rejects unsafe additive migrations with a machine-readable error', async () => {
    const engine = await createWaSqliteEngine();
    try {
      const db = createSqliteLocalDb(engine);
      await db.create('recipes', {
        id: 'text primary key',
        title: 'text',
      });
      let error: unknown;
      try {
        await db.create('recipes', {
          id: 'text primary key',
          title: 'text',
          slug: 'text unique',
        });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(MigrationError);
    } finally {
      await engine.close();
    }
  });
});
