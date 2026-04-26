import { describe, expect, it } from 'bun:test';
import {
  transformValue,
  transformRow,
  buildInsertSql,
  sqlLiteral,
  type TableTransform,
} from './mirror-transforms';

const baseHints: TableTransform = {
  jsonCols: new Set<string>(),
  timestampCols: new Set<string>(),
  boolCols: new Set<string>(),
  arrayCols: new Set<string>(),
};

const withHints = (overrides: Partial<TableTransform>): TableTransform => ({
  ...baseHints,
  ...overrides,
});

describe('transformValue', () => {
  it('passes null through', () => {
    expect(transformValue('any', null, baseHints)).toBeNull();
    expect(transformValue('any', undefined, baseHints)).toBeNull();
  });

  it('coerces Date timestamps to ISO strings', () => {
    const d = new Date('2024-01-02T03:04:05.000Z');
    const out = transformValue('created_at', d, withHints({ timestampCols: new Set(['created_at']) }));
    expect(out).toBe('2024-01-02T03:04:05.000Z');
  });

  it('coerces string timestamps via Date parse', () => {
    const out = transformValue(
      'created_at',
      '2024-01-02 03:04:05+00',
      withHints({ timestampCols: new Set(['created_at']) }),
    );
    expect(typeof out).toBe('string');
    expect(out).toContain('2024-01-02');
  });

  it('coerces booleans to 1/0', () => {
    const hints = withHints({ boolCols: new Set(['is_admin']) });
    expect(transformValue('is_admin', true, hints)).toBe(1);
    expect(transformValue('is_admin', false, hints)).toBe(0);
    expect(transformValue('is_admin', 't', hints)).toBe(1);
    expect(transformValue('is_admin', 1, hints)).toBe(1);
  });

  it('JSON-stringifies object columns', () => {
    const hints = withHints({ jsonCols: new Set(['metadata']) });
    expect(transformValue('metadata', { a: 1, b: 'x' }, hints)).toBe('{"a":1,"b":"x"}');
  });

  it('passes already-stringified JSON through', () => {
    const hints = withHints({ jsonCols: new Set(['metadata']) });
    expect(transformValue('metadata', '{"already":"stringified"}', hints)).toBe(
      '{"already":"stringified"}',
    );
  });

  it('JSON-stringifies Postgres text[] arrays into JSON', () => {
    const hints = withHints({ arrayCols: new Set(['tags']) });
    expect(transformValue('tags', ['a', 'b'], hints)).toBe('["a","b"]');
  });

  it('returns empty array stringification for unexpected types in array col', () => {
    const hints = withHints({ arrayCols: new Set(['tags']) });
    expect(transformValue('tags', 42, hints)).toBe('[]');
  });

  it('passes string array literals through verbatim', () => {
    const hints = withHints({ arrayCols: new Set(['tags']) });
    // pg sometimes returns array as Postgres literal "{a,b}" — passthrough
    expect(transformValue('tags', '{a,b}', hints)).toBe('{a,b}');
  });

  it('converts BigInt to string', () => {
    expect(transformValue('total_bytes', 9007199254740993n, baseHints)).toBe(
      '9007199254740993',
    );
  });

  it('passes plain values through unchanged', () => {
    expect(transformValue('count', 42, baseHints)).toBe(42);
    expect(transformValue('slug', 'foo', baseHints)).toBe('foo');
  });
});

describe('transformRow', () => {
  it('applies hints across multiple columns at once', () => {
    const hints: TableTransform = {
      timestampCols: new Set(['created_at']),
      boolCols: new Set(['is_admin']),
      jsonCols: new Set(['metadata']),
      arrayCols: new Set(['tags']),
    };
    const row = {
      id: 'abc',
      is_admin: true,
      created_at: new Date('2024-01-01T00:00:00.000Z'),
      metadata: { a: 1 },
      tags: ['x', 'y'],
      ignored: 'pass-through',
    };
    expect(transformRow(row, hints)).toEqual({
      id: 'abc',
      is_admin: 1,
      created_at: '2024-01-01T00:00:00.000Z',
      metadata: '{"a":1}',
      tags: '["x","y"]',
      ignored: 'pass-through',
    });
  });
});

describe('sqlLiteral', () => {
  it('emits NULL for null/undefined', () => {
    expect(sqlLiteral(null)).toBe('NULL');
    expect(sqlLiteral(undefined)).toBe('NULL');
  });

  it('emits raw numbers', () => {
    expect(sqlLiteral(42)).toBe('42');
    expect(sqlLiteral(0)).toBe('0');
    expect(sqlLiteral(-1.5)).toBe('-1.5');
  });

  it('emits NULL for non-finite numbers', () => {
    expect(sqlLiteral(NaN)).toBe('NULL');
    expect(sqlLiteral(Infinity)).toBe('NULL');
  });

  it('quotes strings, doubling embedded apostrophes', () => {
    expect(sqlLiteral("o'reilly")).toBe("'o''reilly'");
  });

  it('1/0 for booleans', () => {
    expect(sqlLiteral(true)).toBe('1');
    expect(sqlLiteral(false)).toBe('0');
  });

  it('stringifies bigint', () => {
    expect(sqlLiteral(9007199254740993n)).toBe('9007199254740993');
  });
});

describe('buildInsertSql', () => {
  it('returns null on empty input', () => {
    expect(buildInsertSql('users', ['id'], [])).toBeNull();
  });

  it('builds an INSERT OR REPLACE for a single row', () => {
    const sql = buildInsertSql('users', ['id', 'email'], [{ id: 'u1', email: 'a@b.c' }]);
    expect(sql).toBe(
      `INSERT OR REPLACE INTO "users" ("id", "email") VALUES\n  ('u1', 'a@b.c');`,
    );
  });

  it('builds a multi-row INSERT OR REPLACE', () => {
    const sql = buildInsertSql(
      'users',
      ['id', 'is_admin'],
      [
        { id: 'u1', is_admin: 1 },
        { id: 'u2', is_admin: 0 },
      ],
    );
    expect(sql).toContain('INSERT OR REPLACE INTO "users"');
    expect(sql).toContain(`('u1', 1)`);
    expect(sql).toContain(`('u2', 0)`);
  });

  it('splices NULL for missing values', () => {
    const sql = buildInsertSql('apps', ['id', 'tagline'], [{ id: 'a1', tagline: null }]);
    expect(sql).toContain(`('a1', NULL)`);
  });
});
