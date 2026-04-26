import { describe, expect, test } from 'vitest';
import { hmacSha256Hex, timingSafeEqualHex, verifySha256Signature } from './hmac';

describe('hmac helpers', () => {
  test('hmacSha256Hex produces a stable 64-char hex digest', async () => {
    const out = await hmacSha256Hex('secret', 'hello');
    expect(out).toMatch(/^[0-9a-f]{64}$/);
    // Known fixture for HMAC-SHA256("secret", "hello")
    expect(out).toBe('88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b');
  });

  test('timingSafeEqualHex on equal vs unequal', () => {
    expect(timingSafeEqualHex('abcd', 'abcd')).toBe(true);
    expect(timingSafeEqualHex('abcd', 'abce')).toBe(false);
    expect(timingSafeEqualHex('abcd', 'abc')).toBe(false);
  });

  test('verifySha256Signature accepts sha256= prefix', async () => {
    const sig = await hmacSha256Hex('s', 'body');
    expect(await verifySha256Signature('s', 'body', `sha256=${sig}`)).toBe(true);
    expect(await verifySha256Signature('s', 'body', sig)).toBe(true);
    expect(await verifySha256Signature('s', 'tampered', `sha256=${sig}`)).toBe(false);
    expect(await verifySha256Signature('s', 'body', null)).toBe(false);
  });
});
