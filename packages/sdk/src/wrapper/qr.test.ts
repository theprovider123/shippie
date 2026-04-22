import { describe, expect, test } from 'bun:test';
import { renderQrSvg } from './qr.ts';

describe('renderQrSvg', () => {
  test('returns an SVG string containing at least one rect element', () => {
    const svg = renderQrSvg('https://shippie.app/apps/zen?ref=handoff');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('<rect');
    expect(svg).toContain('</svg>');
  });

  test('output is deterministic for the same input', () => {
    const a = renderQrSvg('https://shippie.app/');
    const b = renderQrSvg('https://shippie.app/');
    expect(a).toBe(b);
  });

  test('different inputs produce different SVGs', () => {
    const a = renderQrSvg('https://a.example');
    const b = renderQrSvg('https://b.example');
    expect(a).not.toBe(b);
  });

  test('accepts size + color options', () => {
    const svg = renderQrSvg('x', { size: 200, fg: '#E8603C', bg: '#14120F' });
    expect(svg).toContain('width="200"');
    expect(svg).toContain('#E8603C');
  });

  test('handles long inputs up to 300 chars', () => {
    const long = 'https://shippie.app/'.padEnd(300, 'a');
    expect(() => renderQrSvg(long)).not.toThrow();
  });

  test('encodes a short URL inside a reasonable module count', () => {
    // For short URLs, QR should pick version 3-5 (33x33 to 37x37 modules).
    // Count rect elements as a proxy for filled modules.
    const svg = renderQrSvg('https://shippie.app/');
    const rectCount = (svg.match(/<rect/g) ?? []).length;
    // At least the quiet-zone background + some dark modules.
    expect(rectCount).toBeGreaterThan(10);
    expect(rectCount).toBeLessThan(2000);
  });
});
