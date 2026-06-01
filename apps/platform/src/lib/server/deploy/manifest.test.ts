/**
 * Unit tests for manifest derivation.
 *
 * Covers:
 *   - maker-provided manifest wins
 *   - shippie.json in the zip is parsed
 *   - default manifest auto-drafts BaaS hostnames into allowed_connect_domains
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { defaultDataPolicy, deriveManifest, scanForBaas } from './manifest';

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
    expect(result.manifest.data).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('normalizes maker-provided source repository URLs', () => {
    const result = deriveManifest({
      slug: 'snake-remix',
      shippieJson: {
        slug: 'snake-remix',
        type: 'app',
        name: 'Snake Remix',
        category: 'games',
        source_repo: 'https://token@github.com/theprovider123/shippie/tree/main/apps/showcase-snake?x=1',
      },
      files: new Map(),
    });

    expect(result.manifest.source_repo).toBe(
      'https://github.com/theprovider123/shippie/tree/main/apps/showcase-snake',
    );
  });

  it('drops unsafe source repository URLs from maker manifests', () => {
    const result = deriveManifest({
      slug: 'bad-source',
      shippieJson: {
        slug: 'bad-source',
        type: 'app',
        name: 'Bad Source',
        category: 'tools',
        source_repo: 'javascript:alert(1)',
        license: 'MIT',
        remix_allowed: true,
      },
      files: new Map(),
    });

    expect(result.manifest.source_repo).toBeUndefined();
    expect(result.manifest.remix_allowed).toBe(true);
  });

  it('normalizes explicit data policy in maker-provided manifest', () => {
    const result = deriveManifest({
      slug: 'whiteboard',
      shippieJson: {
        slug: 'whiteboard',
        type: 'app',
        name: 'Whiteboard',
        category: 'tools',
        theme_color: '#123456',
        data: {
          mode: 'shippie-documents',
          documents: ['main'],
          attachments: false,
          recovery: 'inherited',
          migrations: 'snapshot-v0',
          snapshots: 'inherited',
          media: 'none',
          realtime: 'inherited',
          localStorage: {
            keys: [],
            prefixes: ['whiteboard:'],
          },
        },
      },
      files: new Map(),
    });
    expect(result.manifest.data?.mode).toBe('shippie-documents');
    expect(result.manifest.data?.recovery).toBe('inherited');
    expect(result.manifest.data?.localStorage.prefixes).toEqual(['whiteboard:']);
  });

  it('parses shippie.json from zip when no maker manifest provided', () => {
    const json = JSON.stringify({
      slug: 'old-slug',
      type: 'app',
      name: 'From Zip',
      category: 'games',
      theme_color: '#abcdef',
      data: {
        mode: 'shippie-documents',
        documents: ['league', 'lineups', 'bad id'],
        attachments: true,
        recovery: 'inherited',
        migrations: 'custom',
        snapshots: 'inherited',
        media: 'encrypted-chunked',
        realtime: 'inherited',
        localStorage: {
          keys: ['match-room-theme'],
          prefixes: ['shippie.matchRoom.'],
        },
      },
      spaces: {
        enabled: true,
        roles: [
          { id: 'host', permissions: ['read', 'write', 'invite'] },
          { id: 'bad role', permissions: ['write'] },
          { id: 'viewer', permissions: ['read', 'bad permission!'] },
        ],
        syncMode: 'gossip',
        archivable: true,
      },
    });
    const files = new Map([['shippie.json', enc(json)]]);
    const r = deriveManifest({ slug: 'whiteboard', files });
    expect(r.manifest.name).toBe('From Zip');
    expect(r.manifest.slug).toBe('whiteboard'); // Force-overrides slug from URL
    expect(r.manifest.theme_color).toBe('#abcdef');
    expect(r.manifest.data).toEqual({
      mode: 'shippie-documents',
      documents: ['league', 'lineups'],
      attachments: true,
      recovery: 'inherited',
      migrations: 'custom',
      snapshots: 'inherited',
      media: 'encrypted-chunked',
      realtime: 'inherited',
      localStorage: {
        keys: ['match-room-theme'],
        prefixes: ['shippie.matchRoom.'],
      },
    });
    expect(r.manifest.spaces).toEqual({
      enabled: true,
      roles: [
        { id: 'host', permissions: ['read', 'write', 'invite'] },
        { id: 'viewer', permissions: ['read'] },
      ],
      syncMode: 'gossip',
      archivable: true,
    });
  });

  it('normalizes source repository URLs from zipped shippie.json', () => {
    const json = JSON.stringify({
      name: 'Source App',
      source_repo: 'https://github.com/acme/source-app.git',
      license: 'MIT',
      remix_allowed: true,
    });

    const r = deriveManifest({ slug: 'source-app', files: new Map([['shippie.json', enc(json)]]) });

    expect(r.manifest.source_repo).toBe('https://github.com/acme/source-app');
  });

  it('auto-drafts a default manifest when nothing is provided', () => {
    const r = deriveManifest({ slug: 'recipe-saver', files: new Map() });
    expect(r.manifest.slug).toBe('recipe-saver');
    expect(r.manifest.name).toBe('Recipe Saver'); // Title-cased
    expect(r.manifest.type).toBe('app');
    expect(r.manifest.category).toBe('tools');
    expect(r.manifest.data).toEqual({
      mode: 'shippie-documents',
      documents: ['main'],
      attachments: false,
      recovery: 'inherited',
      migrations: 'snapshot-v0',
      snapshots: 'inherited',
      media: 'none',
      realtime: 'inherited',
      localStorage: {
        keys: [],
        prefixes: [],
      },
    });
  });

  it('keeps Crewtrip on inherited Shippie Documents by default', () => {
    expect(defaultDataPolicy('crewtrip')).toEqual({
      mode: 'shippie-documents',
      documents: ['main'],
      attachments: false,
      recovery: 'inherited',
      migrations: 'snapshot-v0',
      snapshots: 'inherited',
      media: 'none',
      realtime: 'inherited',
      localStorage: {
        keys: [],
        prefixes: [],
      },
    });
  });

  it('parses Crewtrip shippie.json with inherited recovery and encrypted media', () => {
    const raw = readFileSync(
      new URL('../../../../../showcase-crewtrip/shippie.json', import.meta.url),
      'utf8',
    );
    const r = deriveManifest({ slug: 'crewtrip', files: new Map([['shippie.json', enc(raw)]]) });

    expect(r.manifest.data).toEqual({
      mode: 'shippie-documents',
      documents: ['trip-archive'],
      attachments: true,
      recovery: 'inherited',
      migrations: 'snapshot-v0',
      snapshots: 'inherited',
      media: 'encrypted-chunked',
      realtime: 'inherited',
      localStorage: {
        keys: [
          'shippie-crewtrip-v3',
          'shippie-crewtrip-v3-backups',
          'shippie-crewtrip-device-id',
        ],
        prefixes: [
          'shippie-crewtrip-host-v1:',
          'shippie-crewtrip-player-v1:',
        ],
      },
    });
  });

  it('parses flagship local-first app manifests without downgrading sealed recovery', () => {
    const palateRaw = readFileSync(
      new URL('../../../../../showcase-recipe/shippie.json', import.meta.url),
      'utf8',
    );
    const chiwitRaw = readFileSync(
      new URL('../../../../../showcase-chiwit/shippie.json', import.meta.url),
      'utf8',
    );

    const palate = deriveManifest({ slug: 'palate', files: new Map([['shippie.json', enc(palateRaw)]]) });
    const chiwit = deriveManifest({ slug: 'chiwit', files: new Map([['shippie.json', enc(chiwitRaw)]]) });

    expect(palate.manifest.data).toMatchObject({
      mode: 'shippie-documents',
      documents: ['recipe-book'],
      recovery: 'inherited',
      migrations: 'snapshot-v0',
      snapshots: 'inherited',
      realtime: 'inherited',
    });
    expect(palate.manifest.data?.localStorage.keys).toContain('shippie.palate.recipe-hub.v1');
    expect(palate.manifest.data?.localStorage.keys).toContain('shippie.palate.aisle-order.v1');

    expect(chiwit.manifest.data).toMatchObject({
      mode: 'shippie-documents',
      documents: ['daily-pulse'],
      recovery: 'inherited',
      migrations: 'snapshot-v0',
      snapshots: 'inherited',
      realtime: 'inherited',
    });
    expect(chiwit.manifest.data?.localStorage.keys).toContain('shippie.chiwit.daily-pulse.v1');
    expect(chiwit.manifest.data?.localStorage.keys).toContain('CUSTOM_QUICK_ACTIONS');
  });

  it('preserves explicit local-only data policy', () => {
    const json = JSON.stringify({
      name: 'Scratchpad',
      data: {
        mode: 'local-only',
        recovery: 'none',
        migrations: 'none',
      },
    });
    const files = new Map([['shippie.json', enc(json)]]);
    const r = deriveManifest({ slug: 'scratchpad', files });
    expect(r.manifest.data).toEqual({
      mode: 'local-only',
      documents: [],
      attachments: false,
      recovery: 'none',
      migrations: 'none',
      snapshots: 'none',
      media: 'none',
      realtime: 'none',
      localStorage: {
        keys: [],
        prefixes: [],
      },
    });
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
