import { describe, expect, test } from 'bun:test';
import { createSqliteLocalDb, type SqliteEngine, type SqliteParam } from './sqlite.ts';

class RecordingEngine implements SqliteEngine {
  runs: Array<{ sql: string; params?: SqliteParam[] }> = [];
  alls: Array<{ sql: string; params?: SqliteParam[] }> = [];
  nextRows: Record<string, unknown>[] = [];
  private readonly columns = new Map<string, string[]>();

  async run(sql: string, params?: SqliteParam[]): Promise<void> {
    if (sql.startsWith('CREATE VIRTUAL TABLE')) throw new Error('FTS unavailable in recording engine');
    const createMatch = sql.match(/^CREATE TABLE IF NOT EXISTS "([^"]+)"/);
    if (createMatch) this.columns.set(createMatch[1]!, [...sql.matchAll(/"([^"]+)"\s+(TEXT|INTEGER|REAL|BLOB)/g)].map((match) => match[1]!));
    const alterMatch = sql.match(/^ALTER TABLE "([^"]+)" ADD COLUMN "([^"]+)"/);
    if (alterMatch) this.columns.set(alterMatch[1]!, [...(this.columns.get(alterMatch[1]!) ?? []), alterMatch[2]!]);
    this.runs.push({ sql, params });
  }

  async all<T extends Record<string, unknown>>(sql: string, params?: SqliteParam[]): Promise<T[]> {
    this.alls.push({ sql, params });
    const pragmaMatch = sql.match(/^PRAGMA table_info\("([^"]+)"\)/);
    if (pragmaMatch) return (this.columns.get(pragmaMatch[1]!) ?? []).map((name) => ({ name }) as unknown as T);
    return this.nextRows as T[];
  }

  async usage(): Promise<{ usedBytes: number; quotaBytes?: number; persisted?: boolean }> {
    return { usedBytes: 80, quotaBytes: 100, persisted: true };
  }
}

describe('@shippie/local-db sqlite adapter boundary', () => {
  test('generates create, insert, query, update, delete, count SQL', async () => {
    const engine = new RecordingEngine();
    const db = createSqliteLocalDb(engine);
    await db.create('recipes', {
      id: 'text primary key',
      title: 'text',
      rating: 'integer',
      ingredients: 'json',
      embedding: 'blob',
      created: 'datetime',
    });
    await db.insert('recipes', {
      id: '1',
      title: 'Carbonara',
      rating: 5,
      ingredients: ['pasta'],
      embedding: [1, 0],
      created: new Date('2026-04-25T00:00:00.000Z'),
    });
    engine.nextRows = [{ id: '1', title: 'Carbonara', rating: 5, ingredients: '["pasta"]' }];
    const rows = await db.query('recipes', {
      where: { rating: { gte: 4 } },
      orderBy: { created: 'desc' },
      limit: 20,
    });
    await db.update('recipes', '1', { rating: 4 });
    await db.delete('recipes', '1');
    engine.nextRows = [{ n: 2 }];
    expect(await db.count('recipes', { where: { rating: { gte: 4 } } })).toBe(2);

    const runs = engine.runs.map((entry) => entry.sql);
    const alls = engine.alls.filter((entry) => entry.sql.startsWith('SELECT'));
    expect(runs).toContain(
      'CREATE TABLE IF NOT EXISTS "recipes" ("id" TEXT PRIMARY KEY, "title" TEXT, "rating" INTEGER, "ingredients" TEXT, "embedding" BLOB, "created" TEXT)',
    );
    expect(runs.some((sql) => sql.includes('INSERT INTO "recipes"'))).toBe(true);
    expect(alls[0]?.sql).toBe('SELECT * FROM "recipes" WHERE "rating" >= ? ORDER BY "created" DESC LIMIT ?');
    expect(alls[0]?.params).toEqual([4, 20]);
    expect(rows[0]?.ingredients).toEqual(['pasta']);
    expect(runs).toContain('UPDATE "recipes" SET "rating" = ? WHERE "id" = ?');
    expect(runs).toContain('DELETE FROM "recipes" WHERE "id" = ?');
    expect(alls[1]?.sql).toBe('SELECT COUNT(*) AS n FROM "recipes" WHERE "rating" >= ?');
  });

  test('search and usage are adapter-independent', async () => {
    const engine = new RecordingEngine();
    const db = createSqliteLocalDb(engine);
    await db.create('notes', { id: 'text primary key', body: 'text', tags: 'json' });
    await db.search('notes', 'local first', { limit: 5 });
    const select = engine.alls.find((entry) => entry.sql.startsWith('SELECT * FROM "notes"'));
    expect(select?.sql).toBe(
      'SELECT * FROM "notes" WHERE (LOWER(CAST("body" AS TEXT)) LIKE ? OR LOWER(CAST("tags" AS TEXT)) LIKE ?) LIMIT ?',
    );
    expect(select?.params).toEqual(['%local first%', '%local first%', 5]);
    expect(await db.usage()).toEqual({ usedBytes: 80, quotaBytes: 100, warningLevel: 'high', persisted: true });
  });
});
