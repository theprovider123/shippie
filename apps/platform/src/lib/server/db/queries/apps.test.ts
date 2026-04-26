/**
 * Tests for `buildFtsQuery` — the FTS5 query builder.
 *
 * Why this matters: FTS5 MATCH parses operators (`OR`, `NEAR`, quotes,
 * parens). Naively concatenating user input into a MATCH predicate is an
 * injection vector — both for crashes (stray quote → 500) and for
 * potentially leaking rows that should be filtered by the WHERE clause.
 *
 * The tests below pin the contract: every output is either null
 * (untokenizable input → fall through to browse) or a string of
 * quote-wrapped tokens with prefix-`*`. No raw user characters survive.
 */
import { describe, expect, it } from 'bun:test';
import { buildFtsQuery } from './apps';

describe('buildFtsQuery', () => {
  it('returns null for empty / whitespace-only input', () => {
    expect(buildFtsQuery('')).toBeNull();
    expect(buildFtsQuery('   ')).toBeNull();
  });

  it('quotes single-token queries with prefix match', () => {
    expect(buildFtsQuery('recipe')).toBe('"recipe"*');
  });

  it('joins multi-token queries with implicit AND (FTS5 default)', () => {
    expect(buildFtsQuery('recipe saver')).toBe('"recipe"* "saver"*');
  });

  it('strips FTS5 operator tokens (AND OR NOT NEAR) and reserved chars', () => {
    expect(buildFtsQuery('recipe AND saver')).toBe('"recipe"* "saver"*');
    expect(buildFtsQuery('recipe OR saver')).toBe('"recipe"* "saver"*');
    expect(buildFtsQuery('recipe NOT saver')).toBe('"recipe"* "saver"*');
    expect(buildFtsQuery('recipe NEAR saver')).toBe('"recipe"* "saver"*');
  });

  it('strips quotes and parens — the injection vector', () => {
    expect(buildFtsQuery('"foo" OR ""')).toBe('"foo"*');
    expect(buildFtsQuery('foo) (bar')).toBe('"foo"* "bar"*');
    expect(buildFtsQuery('a*b')).toBe('"ab"*');
  });

  it('drops single-character tokens (FTS5 noise)', () => {
    expect(buildFtsQuery('a recipe')).toBe('"recipe"*');
    expect(buildFtsQuery('a b c')).toBeNull();
  });

  it('caps at 8 tokens to bound query cost', () => {
    const long = Array.from({ length: 20 }, (_, i) => `tok${i}`).join(' ');
    const result = buildFtsQuery(long);
    expect(result).toBeTruthy();
    const tokenCount = (result!.match(/\*/g) ?? []).length;
    expect(tokenCount).toBe(8);
  });

  it('handles unicode-letter tokens', () => {
    expect(buildFtsQuery('café')).toBe('"café"*');
    expect(buildFtsQuery('日本語')).toBe('"日本語"*');
  });

  it('strips emojis and other non-letter/non-number chars', () => {
    expect(buildFtsQuery('🚀 launch')).toBe('"launch"*');
    expect(buildFtsQuery('app!@#$%')).toBe('"app"*');
  });
});
