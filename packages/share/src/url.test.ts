import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import {
  buildShareUrl,
  decodeFragmentToBlob,
  encodeBlobToFragment,
  fragmentFitsInQr,
  readImportFragment,
  MAX_FRAGMENT_BYTES,
} from './url';
import { signBlob, bytesToBase64url, type ShareBlob, type UnsignedBlob } from './blob';

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

async function makeSignedBlob(payload: unknown): Promise<ShareBlob> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  const unsigned: UnsignedBlob = {
    v: 1,
    type: 'recipe',
    payload,
    author: { pubkey: bytesToBase64url(new Uint8Array(spki)) },
    created_at: 1700000000000,
  };
  return signBlob(unsigned, pair.privateKey);
}

describe('encode/decode fragment round-trip', () => {
  test('preserves the blob exactly', async () => {
    const blob = await makeSignedBlob({
      title: 'Slow chicken',
      ingredients: [{ name: 'chicken', amount: '4', unit: 'thighs' }],
      notes: 'Bone-in skin-on',
    });
    const fragment = await encodeBlobToFragment(blob);
    expect(fragment).toMatch(/^[A-Za-z0-9_-]+$/); // base64url-safe
    const decoded = await decodeFragmentToBlob(fragment);
    expect(decoded).toEqual(blob);
  });

  test('compression beats raw JSON for repetitive payloads', async () => {
    const blob = await makeSignedBlob({
      lines: Array.from({ length: 50 }, (_, i) => `line ${i}`),
    });
    const fragment = await encodeBlobToFragment(blob);
    const rawJsonLength = JSON.stringify(blob).length;
    expect(fragment.length).toBeLessThan(rawJsonLength);
  });
});

describe('buildShareUrl', () => {
  test('appends fragment to clean baseUrl', async () => {
    const blob = await makeSignedBlob({ title: 'x' });
    const url = await buildShareUrl(blob, 'https://recipe.shippie.app/');
    expect(url.startsWith('https://recipe.shippie.app/#shippie-import=')).toBe(true);
  });
  test('strips an existing fragment from baseUrl', async () => {
    const blob = await makeSignedBlob({ title: 'x' });
    const url = await buildShareUrl(blob, 'https://recipe.shippie.app/#noise');
    expect(url.indexOf('#noise')).toBe(-1);
    expect(url.includes('#shippie-import=')).toBe(true);
  });
});

describe('readImportFragment', () => {
  test('extracts the blob from a share URL', async () => {
    const blob = await makeSignedBlob({ title: 'one-pan' });
    const url = await buildShareUrl(blob, 'https://recipe.shippie.app/');
    const back = await readImportFragment(url);
    expect(back).toEqual(blob);
  });
  test('returns null when no fragment', async () => {
    const back = await readImportFragment('https://recipe.shippie.app/');
    expect(back).toBeNull();
  });
  test('returns null on malformed fragment', async () => {
    const back = await readImportFragment(
      'https://recipe.shippie.app/#shippie-import=not-base64-!!!',
    );
    expect(back).toBeNull();
  });
});

describe('fragmentFitsInQr', () => {
  test('small recipe fits', async () => {
    const blob = await makeSignedBlob({ title: 'quick' });
    const { fits, bytes } = await fragmentFitsInQr(blob);
    expect(fits).toBe(true);
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThanOrEqual(MAX_FRAGMENT_BYTES);
  });
  test('huge incompressible payload does not fit', async () => {
    // Random bytes don't compress, so this simulates a real photo data URL.
    // 'A'.repeat(40_000) gzips to almost nothing, which would fool the test.
    const random = new Uint8Array(8000);
    crypto.getRandomValues(random);
    const photo = bytesToBase64url(random);
    const blob = await makeSignedBlob({ title: 'with-photo', photo });
    const { fits } = await fragmentFitsInQr(blob);
    expect(fits).toBe(false);
  });
});
