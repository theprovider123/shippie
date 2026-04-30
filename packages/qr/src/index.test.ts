import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { qrSvg, scanQr } from './index';

// qr-code-styling is a DOM lib — bring up a happy-dom Window for tests.
let win: Window;
const originalDocument = (globalThis as { document?: unknown }).document;
const originalWindow = (globalThis as { window?: unknown }).window;

beforeAll(() => {
  win = new Window({ url: 'https://shippie.app/' });
  (globalThis as { document?: unknown }).document = win.document;
  (globalThis as { window?: unknown }).window = win;
});

afterAll(async () => {
  (globalThis as { document?: unknown }).document = originalDocument;
  (globalThis as { window?: unknown }).window = originalWindow;
  await win.happyDOM.close();
});

describe('@shippie/qr', () => {
  // Note: tests use `brand: 'none'` because happy-dom can't load the
  // inline rocket data: URL through <img>, and qr-code-styling waits for
  // image load before resolving the SVG. The rocket overlay is exercised
  // by the marketplace render in the platform app itself.

  test('qrSvg produces a valid SVG string for a URL', async () => {
    const svg = await qrSvg('https://shippie.app/invite/abc123', {
      ecc: 'M',
      brand: 'none',
    });
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    // Brand foreground default token
    expect(svg.toLowerCase()).toContain('#14120f');
  });

  test('qrSvg honours custom fg + bg', async () => {
    const svg = await qrSvg('hi', {
      brand: 'none',
      fg: '#aabbcc',
      bg: '#001122',
    });
    expect(svg.toLowerCase()).toContain('#aabbcc');
    expect(svg.toLowerCase()).toContain('#001122');
  });

  test('qrSvg respects size hint', async () => {
    const url =
      'https://shippie.app/apps/mevrouw/invite?token=abcdef0123456789abcdef0123456789';
    const svg = await qrSvg(url, { ecc: 'H', size: 320, brand: 'none' });
    // Size hint reflects through to the root <svg> width attribute.
    expect(svg).toMatch(/width=["']?320/);
    expect(svg).toMatch(/height=["']?320/);
  });

  test('different ECC levels produce valid SVGs (round-trip-ish)', async () => {
    for (const ecc of ['L', 'M', 'Q', 'H'] as const) {
      const svg = await qrSvg('https://shippie.app', { ecc, brand: 'none' });
      expect(svg).toContain('<svg');
      // Higher ECC = more dots = bigger SVG payload as a rough sanity check.
      expect(svg.length).toBeGreaterThan(100);
    }
  });

  test('scanQr stub throws not_implemented for v1', async () => {
    await expect(
      // MediaStream isn't available in Bun's test env; the stub throws
      // before touching it.
      scanQr({} as MediaStream),
    ).rejects.toThrow('not_implemented');
  });
});
