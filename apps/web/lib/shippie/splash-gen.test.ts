import { describe, expect, test } from 'bun:test';
import { generateIcons, generateSplashes, IOS_SPLASH_SIZES, ICON_SIZES } from './splash-gen.ts';
import sharp from 'sharp';

// A 512x512 solid red PNG, generated on-the-fly so the test is self-contained.
async function fixtureSource(): Promise<Buffer> {
  return sharp({
    create: { width: 512, height: 512, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

describe('IOS_SPLASH_SIZES', () => {
  test('defines at least 10 device sizes', () => {
    expect(IOS_SPLASH_SIZES.length).toBeGreaterThan(9);
  });
  test('each entry has a unique device name', () => {
    const names = IOS_SPLASH_SIZES.map((s) => s.device);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('ICON_SIZES', () => {
  test('includes 192 and 512 in both any and maskable purposes', () => {
    const pairs = ICON_SIZES.map((i) => `${i.size}-${i.purpose}`);
    expect(pairs).toContain('192-any');
    expect(pairs).toContain('512-any');
    expect(pairs).toContain('192-maskable');
    expect(pairs).toContain('512-maskable');
  });
});

describe('generateIcons', () => {
  test('produces one buffer per ICON_SIZES entry, each a valid PNG', async () => {
    const src = await fixtureSource();
    const out = await generateIcons(src);
    expect(out.length).toBe(ICON_SIZES.length);
    for (const item of out) {
      // PNG magic bytes 89 50 4E 47
      expect(item.buffer[0]).toBe(0x89);
      expect(item.buffer[1]).toBe(0x50);
      expect(item.buffer[2]).toBe(0x4e);
      expect(item.buffer[3]).toBe(0x47);
      // Size matches
      const meta = await sharp(item.buffer).metadata();
      expect(meta.width).toBe(item.size);
      expect(meta.height).toBe(item.size);
    }
  });

  test('maskable variants embed the icon inside a safe-area inset', async () => {
    const src = await fixtureSource();
    const out = await generateIcons(src);
    const maskable = out.find((i) => i.purpose === 'maskable' && i.size === 192);
    expect(maskable).toBeDefined();
    // Confirm background extends to edges: sample corner pixel should be
    // the configured background color (not source icon pixels).
    const { data } = await sharp(maskable!.buffer).raw().toBuffer({ resolveWithObject: true });
    const [r] = [data[0]];
    // The background default is #14120F (dark), so r should be ~20.
    expect(r).toBeLessThan(64);
  });
});

describe('generateSplashes', () => {
  test('produces one PNG per IOS_SPLASH_SIZES entry with matching dims', async () => {
    const src = await fixtureSource();
    const out = await generateSplashes(src, '#14120F');
    expect(out.length).toBe(IOS_SPLASH_SIZES.length);
    for (const s of out) {
      const expected = IOS_SPLASH_SIZES.find((e) => e.device === s.device)!;
      const meta = await sharp(s.buffer).metadata();
      expect(meta.width).toBe(expected.width);
      expect(meta.height).toBe(expected.height);
    }
  });
});
