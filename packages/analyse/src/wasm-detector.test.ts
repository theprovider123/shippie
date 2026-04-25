// packages/analyse/src/wasm-detector.test.ts
import { describe, expect, test } from 'bun:test';
import { detectWasm } from './wasm-detector.ts';

const enc = (s: string) => new TextEncoder().encode(s);

describe('detectWasm', () => {
  test('empty bundle → not detected, empty headers', () => {
    const result = detectWasm(new Map());
    expect(result.detected).toBe(false);
    expect(result.files).toEqual([]);
    expect(result.headers).toEqual({});
  });

  test('bundle with one .wasm file → detected with the three required headers', () => {
    const files = new Map<string, Uint8Array>([
      ['index.html', enc('<html></html>')],
      ['pkg/foo_bg.wasm', new Uint8Array([0x00, 0x61, 0x73, 0x6d])],
    ]);
    const result = detectWasm(files);
    expect(result.detected).toBe(true);
    expect(result.files).toEqual(['pkg/foo_bg.wasm']);
    expect(result.headers['Content-Type']).toBe('application/wasm');
    expect(result.headers['Cross-Origin-Embedder-Policy']).toBe('require-corp');
    expect(result.headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(Object.keys(result.headers).length).toBe(3);
  });

  test('bundle with multiple .wasm files → all listed', () => {
    const files = new Map<string, Uint8Array>([
      ['index.html', enc('<html></html>')],
      ['wasm/main.wasm', new Uint8Array([0x00, 0x61, 0x73, 0x6d])],
      ['pkg/foo_bg.wasm', new Uint8Array([0x00, 0x61, 0x73, 0x6d])],
      ['nested/deep/path/extra.wasm', new Uint8Array([0x00, 0x61, 0x73, 0x6d])],
    ]);
    const result = detectWasm(files);
    expect(result.detected).toBe(true);
    expect(result.files.length).toBe(3);
    expect(result.files).toContain('wasm/main.wasm');
    expect(result.files).toContain('pkg/foo_bg.wasm');
    expect(result.files).toContain('nested/deep/path/extra.wasm');
    expect(result.headers['Content-Type']).toBe('application/wasm');
  });
});
