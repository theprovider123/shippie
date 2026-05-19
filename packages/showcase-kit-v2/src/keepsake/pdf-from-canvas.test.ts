import { describe, expect, test } from 'bun:test';
import { bytesToBase64 } from './pdf-from-canvas';

describe('bytesToBase64', () => {
  test('encodes ascii bytes', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(bytesToBase64(bytes)).toBe('SGVsbG8=');
  });

  test('encodes binary bytes (PNG signature)', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytesToBase64(bytes)).toBe('iVBORw0KGgo=');
  });

  test('handles large inputs without stack overflow', () => {
    const bytes = new Uint8Array(200_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i & 0xff;
    const encoded = bytesToBase64(bytes);
    expect(encoded.length).toBeGreaterThan(200_000); // base64 inflates ~4/3x
  });
});
