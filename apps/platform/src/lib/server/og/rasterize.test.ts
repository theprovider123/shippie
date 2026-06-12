/**
 * Node-side proof that the share-card pipeline produces a real PNG:
 * builder → resvg-wasm rasterization, with the exact wasm + font binaries
 * that ship in static/__shippie/ (the Worker fetches the same files through
 * its assets binding; here they're injected from disk).
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { buildAppCardSvg, OG_FONT_FAMILY, type AppShareMeta } from './app-card';
import { rasterizeSvgToPng } from './rasterize';

const STATIC_DIR = fileURLToPath(new URL('../../../../static/__shippie/', import.meta.url));

const fixture: AppShareMeta = {
  slug: 'golazo',
  name: 'Golazo',
  description: 'Matchday football games with friends — free kicks, penalties, leaderboards.',
  category: 'games',
  accent: '#1B6B5C',
  iconUrl: null,
};

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
  );
}

describe('og card rasterization (resvg-wasm)', () => {
  test('renders the app card SVG to a 1200x630 PNG', async () => {
    const [wasm, font] = await Promise.all([
      readFile(`${STATIC_DIR}resvg.wasm`),
      readFile(`${STATIC_DIR}og-font.ttf`),
    ]);

    const svg = buildAppCardSvg(fixture, 'https://shippie.app');
    expect(svg).toContain('Golazo');

    const png = await rasterizeSvgToPng(svg, {
      wasm: () => new Uint8Array(wasm),
      fonts: [new Uint8Array(font)],
      defaultFontFamily: OG_FONT_FAMILY,
      width: 1200,
    });

    // PNG signature: 0x89 'P' 'N' 'G'
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);

    // IHDR is always the first chunk: width at byte 16, height at byte 20.
    expect(readUint32BE(png, 16)).toBe(1200);
    expect(readUint32BE(png, 20)).toBe(630);

    // A blank/failed raster compresses to almost nothing; a real card with
    // gradient + glyphs lands well above this floor.
    expect(png.byteLength).toBeGreaterThan(10_000);
  });
});
