/**
 * Unit tests for manifest derivation.
 *
 * Covers:
 *   - maker-provided manifest wins
 *   - shippie.json in the zip is parsed
 *   - default manifest auto-drafts BaaS hostnames into allowed_connect_domains
 */
import { describe, it, expect } from 'vitest';
import { deriveManifest, scanForBaas } from './manifest';

const enc = (s: string) => new TextEncoder().encode(s);

describe('deriveManifest', () => {
  it('respects maker-provided manifest', () => {
    const result = deriveManifest({
      slug: 'whiteboard',
      shippieJson: {
        slug: 'whiteboard',
        type: 'app',
        name: 'Whiteboard',
        category: 'tools',
        theme_color: '#123456',
      },
      files: new Map(),
    });
    expect(result.manifest.name).toBe('Whiteboard');
    expect(result.manifest.theme_color).toBe('#123456');
    expect(result.error).toBeUndefined();
  });

  it('parses shippie.json from zip when no maker manifest provided', () => {
    const json = JSON.stringify({
      slug: 'old-slug',
      type: 'app',
      name: 'From Zip',
      category: 'games',
      theme_color: '#abcdef',
    });
    const files = new Map([['shippie.json', enc(json)]]);
    const r = deriveManifest({ slug: 'whiteboard', files });
    expect(r.manifest.name).toBe('From Zip');
    expect(r.manifest.slug).toBe('whiteboard'); // Force-overrides slug from URL
    expect(r.manifest.theme_color).toBe('#abcdef');
  });

  it('auto-drafts a default manifest when nothing is provided', () => {
    const r = deriveManifest({ slug: 'recipe-saver', files: new Map() });
    expect(r.manifest.slug).toBe('recipe-saver');
    expect(r.manifest.name).toBe('Recipe Saver'); // Title-cased
    expect(r.manifest.type).toBe('app');
    expect(r.manifest.category).toBe('tools');
  });

  it('auto-detects Supabase BaaS in default draft', () => {
    const indexHtml = `<script>fetch("https://abcd123.supabase.co/rest/v1/things")</script>`;
    const files = new Map([['index.html', enc(indexHtml)]]);
    const r = deriveManifest({ slug: 'sb-app', files });
    expect(r.manifest.permissions?.external_network).toBe(true);
    expect(r.manifest.allowed_connect_domains).toEqual(['abcd123.supabase.co']);
    expect(r.notes[0]).toContain('Supabase');
  });

  it('handles malformed shippie.json gracefully', () => {
    const files = new Map([['shippie.json', enc('{not json')]]);
    const r = deriveManifest({ slug: 'broken', files });
    expect(r.error).toBeDefined();
  });
});

describe('scanForBaas', () => {
  it('detects Firebase storage URL', () => {
    const html = `<img src="https://firebasestorage.googleapis.com/v0/b/p/o/x.png">`;
    const r = scanForBaas(new Map([['index.html', enc(html)]]));
    expect(r.found).toBe(true);
    expect(r.providers).toContain('Firebase');
  });

  it('detects multiple providers in one file', () => {
    const js = `
      const a = "https://abc.supabase.co/x";
      const b = "https://my.clerk.com/login";
    `;
    const r = scanForBaas(new Map([['app.js', enc(js)]]));
    expect(r.providers).toEqual(['Clerk', 'Supabase']);
  });

  it('ignores non-scannable files', () => {
    const r = scanForBaas(new Map([['logo.png', enc('https://abc.supabase.co')]]));
    expect(r.found).toBe(false);
  });
});
