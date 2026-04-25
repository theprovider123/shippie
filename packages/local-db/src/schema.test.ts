import { describe, expect, test } from 'bun:test';
import { normalizeLocalDbSchema, normalizeTableName } from './schema.ts';

describe('@shippie/local-db schema helpers', () => {
  test('normalizes valid schemas', () => {
    expect(normalizeTableName('recipes')).toBe('recipes');
    expect(normalizeLocalDbSchema({ id: 'text primary key', rating: 'integer' })).toEqual([
      { name: 'id', type: 'text primary key', baseType: 'text', constraints: 'primary key' },
      { name: 'rating', type: 'integer', baseType: 'integer', constraints: '' },
    ]);
  });

  test('rejects unsafe identifiers and unsupported types', () => {
    expect(() => normalizeTableName('recipes;drop')).toThrow(/Invalid table/);
    expect(() => normalizeLocalDbSchema({ 'bad-name': 'text' })).toThrow(/Invalid column/);
    expect(() => normalizeLocalDbSchema({ id: 'uuid' as never })).toThrow(/Invalid column type/);
  });
});
