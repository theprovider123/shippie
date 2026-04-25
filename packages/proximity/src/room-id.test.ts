import { describe, expect, test } from 'bun:test';
import { deriveRoomId, generateJoinCode, normalizeIp } from './room-id.ts';

describe('deriveRoomId', () => {
  test('produces stable 64-char hex digest', async () => {
    const id = await deriveRoomId('1.2.3.4', 'whiteboard', 'ABCDEFGH');
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    const id2 = await deriveRoomId('1.2.3.4', 'whiteboard', 'ABCDEFGH');
    expect(id2).toBe(id);
  });

  test('different inputs → different ids', async () => {
    const a = await deriveRoomId('1.2.3.4', 'whiteboard', 'ABCDEFGH');
    const b = await deriveRoomId('1.2.3.5', 'whiteboard', 'ABCDEFGH');
    const c = await deriveRoomId('1.2.3.4', 'recipe', 'ABCDEFGH');
    const d = await deriveRoomId('1.2.3.4', 'whiteboard', 'ZZZZZZZZ');
    expect(new Set([a, b, c, d]).size).toBe(4);
  });

  test('case-insensitive on group code', async () => {
    const a = await deriveRoomId('1.2.3.4', 'whiteboard', 'ABCDEFGH');
    const b = await deriveRoomId('1.2.3.4', 'whiteboard', 'abcdefgh');
    expect(a).toBe(b);
  });

  test('IPv4-mapped IPv6 collides with the v4 form', async () => {
    const a = await deriveRoomId('1.2.3.4', 'whiteboard', 'ABCDEFGH');
    const b = await deriveRoomId('::FFFF:1.2.3.4', 'whiteboard', 'ABCDEFGH');
    expect(a).toBe(b);
  });

  test('rejects empty inputs', async () => {
    await expect(deriveRoomId('', 'a', 'b')).rejects.toThrow();
    await expect(deriveRoomId('a', '', 'b')).rejects.toThrow();
    await expect(deriveRoomId('a', 'b', '')).rejects.toThrow();
  });
});

describe('generateJoinCode', () => {
  test('returns 8 base32 chars from Crockford alphabet', () => {
    const code = generateJoinCode();
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{8}$/);
  });

  test('codes are different across calls (probabilistically)', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) codes.add(generateJoinCode());
    expect(codes.size).toBeGreaterThan(45);
  });
});

describe('normalizeIp', () => {
  test('strips IPv4-mapped prefix', () => {
    expect(normalizeIp('::ffff:1.2.3.4')).toBe('1.2.3.4');
    expect(normalizeIp('::FFFF:1.2.3.4')).toBe('1.2.3.4');
  });

  test('lower-cases IPv6', () => {
    expect(normalizeIp('2001:DB8::1')).toBe('2001:db8::1');
  });
});
