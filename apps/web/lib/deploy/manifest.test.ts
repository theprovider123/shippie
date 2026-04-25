/**
 * Integration tests for the auto-draft manifest flow in deriveManifest().
 *
 * The scanner itself is covered in trust/baas-scanner.test.ts — these
 * tests pin the contract between deriveManifest and the scanner:
 *   - maker-provided manifest wins (no auto-injection of permissions)
 *   - auto-drafted + Supabase detected → external_network=true +
 *     allowed_connect_domains pre-populated + a report note emitted
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ShippieJson } from '@shippie/shared';
import { deriveManifest, resolveIconAsset } from './index';

function files(entries: Record<string, string>): Map<string, Buffer> {
  return new Map(Object.entries(entries).map(([k, v]) => [k, Buffer.from(v)]));
}

test('maker manifest wins — no auto-injected permissions even if Supabase detected', () => {
  const makerManifest: ShippieJson = {
    version: 1,
    type: 'app',
    name: 'My App',
    category: 'tools',
  };
  const { manifest, notes } = deriveManifest(
    {
      slug: 'my-app',
      makerId: 'u1',
      zipBuffer: Buffer.alloc(0),
      shippieJson: makerManifest,
      reservedSlugs: new Set(),
    },
    files({ 'app.js': 'fetch("https://abc.supabase.co/x")' }),
  );
  assert.equal(manifest.permissions?.external_network, undefined);
  assert.equal(manifest.allowed_connect_domains, undefined);
  assert.deepEqual(notes, []);
  // The maker's slug should be overwritten with the deploy slug.
  assert.equal(manifest.slug, 'my-app');
});

test('auto-draft with clean bundle — no external_network, no notes', () => {
  const { manifest, notes } = deriveManifest(
    {
      slug: 'clean',
      makerId: 'u1',
      zipBuffer: Buffer.alloc(0),
      reservedSlugs: new Set(),
    },
    files({ 'index.html': '<h1>Hi</h1>', 'app.js': 'fetch("/api/local")' }),
  );
  assert.equal(manifest.permissions?.external_network, undefined);
  assert.equal(manifest.allowed_connect_domains, undefined);
  assert.deepEqual(notes, []);
});

test('auto-draft with Supabase — enables external_network and populates domains', () => {
  const { manifest, notes } = deriveManifest(
    {
      slug: 'chiwit-app',
      makerId: 'u1',
      zipBuffer: Buffer.alloc(0),
      reservedSlugs: new Set(),
    },
    files({
      'app.js':
        'createClient("https://abc123.supabase.co", "anon"); fetch("https://abc123.supabase.co/rest/v1/items");',
    }),
  );
  assert.equal(manifest.permissions?.external_network, true);
  assert.deepEqual(manifest.allowed_connect_domains, ['abc123.supabase.co']);
  assert.equal(notes.length, 1);
  assert.match(notes[0]!, /Auto-detected Supabase/);
  assert.match(notes[0]!, /abc123\.supabase\.co/);
});

test('auto-draft with Firebase + Clerk — merges both providers into one note', () => {
  const { manifest, notes } = deriveManifest(
    {
      slug: 'multi',
      makerId: 'u1',
      zipBuffer: Buffer.alloc(0),
      reservedSlugs: new Set(),
    },
    files({
      'app.js':
        'fetch("https://my-proj.firebaseio.com/x"); fetch("https://my.clerk.accounts.dev/v1/client");',
    }),
  );
  assert.equal(manifest.permissions?.external_network, true);
  assert.deepEqual(
    manifest.allowed_connect_domains,
    ['my-proj.firebaseio.com', 'my.clerk.accounts.dev'],
  );
  assert.equal(notes.length, 1);
  assert.match(notes[0]!, /Clerk/);
  assert.match(notes[0]!, /Firebase/);
});

test('auto-draft preserves baseline fields (version, type, theme)', () => {
  const { manifest } = deriveManifest(
    {
      slug: 'hello-world',
      makerId: 'u1',
      zipBuffer: Buffer.alloc(0),
      reservedSlugs: new Set(),
    },
    files({ 'app.js': 'fetch("https://x.supabase.co/y")' }),
  );
  assert.equal(manifest.version, 1);
  assert.equal(manifest.type, 'app');
  assert.equal(manifest.slug, 'hello-world');
  assert.equal(manifest.name, 'Hello World');
  assert.equal(manifest.theme_color, '#E8603C');
});

test('maker public shippie.json lowers into internal manifest', () => {
  const { manifest, notes } = deriveManifest(
    {
      slug: 'local-recipes',
      makerId: 'u1',
      zipBuffer: Buffer.alloc(0),
      reservedSlugs: new Set(),
    },
    files({
      'shippie.json': JSON.stringify({
        version: 1,
        name: 'Local Recipes',
        icon: './icon.png',
        theme_color: '#E8603C',
        display: 'standalone',
        categories: ['food', 'tools'],
        local: { database: true, files: true, ai: ['embeddings'], sync: false },
      }),
      'index.html': '<h1>Recipes</h1>',
    }),
  );

  assert.equal(manifest.slug, 'local-recipes');
  assert.equal(manifest.name, 'Local Recipes');
  assert.equal(manifest.category, 'food');
  assert.equal(manifest.pwa?.display, 'standalone');
  assert.deepEqual(manifest.pwa?.categories, ['food', 'tools']);
  assert.equal(manifest.permissions?.storage, 'rw');
  assert.equal(manifest.permissions?.files, true);
  assert.deepEqual(manifest.permissions?.native_bridge, ['local-ai:embeddings']);
  assert.match(notes[0] ?? '', /Compiled maker shippie\.json/);
});

test('invalid public shippie.json is a fatal manifest error', () => {
  const { error } = deriveManifest(
    {
      slug: 'bad',
      makerId: 'u1',
      zipBuffer: Buffer.alloc(0),
      reservedSlugs: new Set(),
    },
    files({
      'shippie.json': JSON.stringify({
        version: 1,
        name: 'Bad',
        unexpected: true,
      }),
      'index.html': '<h1>Bad</h1>',
    }),
  );

  assert.match(error ?? '', /unrecognized/i);
});

test('icon resolution reads browser manifest icons before fallback', () => {
  const icon = resolveIconAsset(
    {
      version: 1,
      slug: 'expo',
      type: 'app',
      name: 'Expo',
      category: 'tools',
    },
    files({
      'manifest.json': JSON.stringify({
        icons: [
          { src: './small.png', sizes: '192x192', type: 'image/png' },
          { src: './assets/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      }),
      'small.png': 'small',
      'assets/icon-512.png': 'large',
      'icon.png': 'fallback',
    }),
  );

  assert.equal(icon?.path, 'assets/icon-512.png');
  assert.equal(icon?.source, 'web_manifest');
  assert.equal(icon?.buffer.toString('utf8'), 'large');
});

test('icon resolution lets shippie.json icon win over browser manifest', () => {
  const icon = resolveIconAsset(
    {
      version: 1,
      slug: 'custom',
      type: 'app',
      name: 'Custom',
      category: 'tools',
      icon: './brand/icon.png',
    },
    files({
      'manifest.json': JSON.stringify({ icons: [{ src: './assets/icon-512.png', sizes: '512x512' }] }),
      'assets/icon-512.png': 'manifest',
      'brand/icon.png': 'declared',
    }),
  );

  assert.equal(icon?.path, 'brand/icon.png');
  assert.equal(icon?.source, 'shippie_json');
  assert.equal(icon?.buffer.toString('utf8'), 'declared');
});
