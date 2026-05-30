import { describe, expect, it } from 'bun:test';
import { ulid } from './ulid.ts';

describe('ulid', () => {
  it('produces a 26-character Crockford base32 string', () => {
    const id = ulid();
    expect(id).toHaveLength(26);
    expect(/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)).toBe(true);
  });

  it('is monotonically sortable by time for distinct timestamps', () => {
    const a = ulid(1_700_000_000_000);
    const b = ulid(1_700_000_000_001);
    const c = ulid(1_700_000_001_000);
    const sorted = [b, a, c].sort();
    expect(sorted).toEqual([a, b, c]);
  });

  it('rejects invalid timestamps', () => {
    expect(() => ulid(Number.NaN)).toThrow();
    expect(() => ulid(-1)).toThrow();
  });

  it('mixes injected randomness for deterministic tests', () => {
    const fixed = new Uint8Array(16).fill(7);
    const id1 = ulid(1_700_000_000_000, () => fixed);
    const id2 = ulid(1_700_000_000_000, () => fixed);
    expect(id1).toEqual(id2);
  });
});
