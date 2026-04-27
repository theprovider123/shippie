import { describe, expect, test } from 'vitest';
import { injectEssentials } from './pipeline';
import type { ShippieJsonLite } from './manifest';

const manifest = {
  name: 'Recipe Saver',
  description: 'Save & cook your recipes offline.',
  tagline: 'Local-first recipe app',
  theme_color: '#E8603C',
  type: 'app',
  category: 'cooking',
} as unknown as ShippieJsonLite;

const CSP_META = '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">';

describe('injectEssentials', () => {
  test('injects CSP meta into <head>', () => {
    const out = injectEssentials('<html><head></head><body></body></html>', CSP_META, manifest);
    expect(out).toContain('Content-Security-Policy');
  });

  test('adds viewport meta when missing', () => {
    const out = injectEssentials('<html><head></head><body></body></html>', CSP_META, manifest);
    expect(out).toContain('name="viewport"');
    expect(out).toContain('width=device-width');
  });

  test('does not duplicate viewport meta when maker provided one', () => {
    const html =
      '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head></html>';
    const out = injectEssentials(html, CSP_META, manifest);
    const matches = out.match(/name="viewport"/g);
    expect(matches?.length).toBe(1);
  });

  test('adds charset utf-8 when missing', () => {
    const out = injectEssentials('<html><head></head></html>', CSP_META, manifest);
    expect(out).toContain('charset="utf-8"');
  });

  test('does not add charset when maker provided one', () => {
    const out = injectEssentials(
      '<html><head><meta charset="utf-8"></head></html>',
      CSP_META,
      manifest,
    );
    const matches = out.match(/charset=/g);
    expect(matches?.length).toBe(1);
  });

  test('adds lang to <html> when missing', () => {
    const out = injectEssentials('<html><head></head></html>', CSP_META, manifest);
    expect(out).toContain('<html lang="en">');
  });

  test('does not overwrite lang when present', () => {
    const out = injectEssentials('<html lang="fr"><head></head></html>', CSP_META, manifest);
    expect(out).toContain('<html lang="fr">');
    expect(out).not.toContain('<html lang="en">');
  });

  test('adds OG tags from manifest when missing', () => {
    const out = injectEssentials('<html><head></head></html>', CSP_META, manifest);
    expect(out).toContain('property="og:title"');
    expect(out).toContain('Recipe Saver');
    expect(out).toContain('property="og:description"');
    expect(out).toContain('og:type');
  });

  test('does not inject OG tags when maker already has them', () => {
    const html = '<html><head><meta property="og:title" content="My App"></head></html>';
    const out = injectEssentials(html, CSP_META, manifest);
    const matches = out.match(/property="og:title"/g);
    expect(matches?.length).toBe(1);
    expect(out).not.toContain('Recipe Saver');
  });

  test('adds theme-color when missing', () => {
    const out = injectEssentials('<html><head></head></html>', CSP_META, manifest);
    expect(out).toContain('name="theme-color"');
    expect(out).toContain('#E8603C');
  });

  test('escapes special chars in attribute values', () => {
    const dangerous = {
      ...manifest,
      name: 'My "App" & <Co>',
      description: 'A description',
    } as unknown as ShippieJsonLite;
    const out = injectEssentials('<html><head></head></html>', CSP_META, dangerous);
    expect(out).toContain('&quot;App&quot;');
    expect(out).toContain('&amp;');
    expect(out).toContain('&lt;Co&gt;');
  });
});
