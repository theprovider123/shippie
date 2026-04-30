import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import {
  canonicalize,
  hashCanonical,
  signBlob,
  verifyBlob,
  bytesToBase64url,
  base64urlToBytes,
  type UnsignedBlob,
} from './blob';

let win: Window;
const originalWindow = (globalThis as { window?: unknown }).window;
const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

beforeAll(() => {
  win = new Window({ url: 'https://recipe.shippie.app/' });
  (globalThis as { window?: unknown }).window = win;
  (globalThis as { localStorage?: unknown }).localStorage = win.localStorage;
});

afterAll(async () => {
  (globalThis as { window?: unknown }).window = originalWindow;
  (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
  await win.happyDOM.close();
});

async function makeKey() {
  const pair = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  return { pair, pubkey: bytesToBase64url(new Uint8Array(spki)) };
}

describe('canonicalize', () => {
  test('sorts object keys', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });
  test('handles arrays + nesting', () => {
    expect(canonicalize({ items: [{ b: 1, a: 2 }] })).toBe('{"items":[{"a":2,"b":1}]}');
  });
  test('null + scalars', () => {
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize(42)).toBe('42');
    expect(canonicalize('hi')).toBe('"hi"');
  });
});

describe('base64url round-trip', () => {
  test('round-trips arbitrary bytes', () => {
    for (let len of [0, 1, 16, 100, 256]) {
      const bytes = new Uint8Array(len);
      crypto.getRandomValues(bytes);
      const s = bytesToBase64url(bytes);
      const back = base64urlToBytes(s);
      expect(back.length).toBe(bytes.length);
      for (let i = 0; i < len; i++) expect(back[i]).toBe(bytes[i]);
    }
  });
});

describe('hashCanonical', () => {
  test('stable across key order + array equality', async () => {
    const a = await hashCanonical({ b: 2, a: 1, list: [3, 4] });
    const b = await hashCanonical({ a: 1, list: [3, 4], b: 2 });
    expect(a).toBe(b);
  });
  test('changes when payload changes', async () => {
    const a = await hashCanonical({ x: 1 });
    const b = await hashCanonical({ x: 2 });
    expect(a).not.toBe(b);
  });
});

describe('signBlob + verifyBlob', () => {
  test('round-trip — valid signature over canonical encoding', async () => {
    const { pair, pubkey } = await makeKey();
    const unsigned: UnsignedBlob = {
      v: 1,
      type: 'recipe',
      payload: { title: 'Slow chicken' },
      author: { pubkey, name: 'kind crane' },
      created_at: 1700000000000,
    };
    const blob = await signBlob(unsigned, pair.privateKey);
    expect(blob.sig).toBeTruthy();
    const result = await verifyBlob(blob);
    expect(result.valid).toBe(true);
  });

  test('detects payload tampering', async () => {
    const { pair, pubkey } = await makeKey();
    const blob = await signBlob(
      {
        v: 1,
        type: 'recipe',
        payload: { title: 'original' },
        author: { pubkey },
        created_at: 1700000000000,
      },
      pair.privateKey,
    );
    const tampered = {
      ...blob,
      payload: { title: 'tampered' },
    };
    const result = await verifyBlob(tampered);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('tampered');
  });

  test('detects pubkey-author mismatch', async () => {
    const { pair: a, pubkey: keyA } = await makeKey();
    const { pubkey: keyB } = await makeKey();
    // Sign with A's private key but advertise B's pubkey.
    const blob = await signBlob(
      {
        v: 1,
        type: 'recipe',
        payload: {},
        author: { pubkey: keyA },
        created_at: 1,
      },
      a.privateKey,
    );
    const swapped = { ...blob, author: { pubkey: keyB } };
    const result = await verifyBlob(swapped);
    expect(result.valid).toBe(false);
  });

  test('returns malformed for missing sig', async () => {
    const result = await verifyBlob({
      v: 1,
      type: 'x',
      payload: {},
      author: { pubkey: 'aaaa' },
      created_at: 1,
      sig: '',
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe('malformed');
  });
});
