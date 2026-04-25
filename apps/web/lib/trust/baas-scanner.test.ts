import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanForBaas, matchProvider } from './baas-scanner';

function files(entries: Record<string, string | Buffer>): Map<string, Buffer> {
  return new Map(
    Object.entries(entries).map(([k, v]) => [k, Buffer.isBuffer(v) ? v : Buffer.from(v)]),
  );
}

test('supabase: resolves wildcard to specific subdomain', () => {
  const r = scanForBaas(
    files({
      'app.js':
        'const supabase = createClient("https://abc123.supabase.co/rest/v1", "anon-key");',
    }),
  );
  assert.equal(r.found, true);
  assert.deepEqual(r.domains, ['abc123.supabase.co']);
  assert.deepEqual(r.providers, ['Supabase']);
});

test('firebase: multiple firebase hosts collapse into one provider', () => {
  const r = scanForBaas(
    files({
      'index.html':
        '<script>fetch("https://my-proj.firebaseio.com/data.json"); fetch("https://firestore.googleapis.com/v1/x");</script>',
    }),
  );
  assert.equal(r.found, true);
  assert.deepEqual(r.providers, ['Firebase']);
  assert.ok(r.domains.includes('my-proj.firebaseio.com'));
  assert.ok(r.domains.includes('firestore.googleapis.com'));
});

test('clerk: matches clerk.accounts.dev and clerk.com', () => {
  const r = scanForBaas(
    files({
      'app.js':
        'Clerk.load({ publishableKey: "pk_test_..." }); fetch("https://my-app.clerk.accounts.dev/v1/client");',
      'vendor.js': 'https://api.clerk.com/v1/users',
    }),
  );
  assert.equal(r.found, true);
  assert.deepEqual(r.providers, ['Clerk']);
  assert.ok(r.domains.includes('my-app.clerk.accounts.dev'));
  assert.ok(r.domains.includes('api.clerk.com'));
});

test('multiple providers in one bundle', () => {
  const r = scanForBaas(
    files({
      'bundle.js':
        'fetch("https://abc.supabase.co/x"); fetch("https://proj.firebaseio.com/y"); fetch("https://my.auth0.com/z");',
    }),
  );
  assert.deepEqual(r.providers, ['Auth0', 'Firebase', 'Supabase']);
  assert.equal(r.domains.length, 3);
});

test('clean bundle: no BaaS hosts → not found', () => {
  const r = scanForBaas(
    files({
      'index.html': '<h1>Hello</h1>',
      'app.js': 'fetch("/api/local"); fetch("https://example.com/data")',
      'style.css': 'body { color: red; }',
    }),
  );
  assert.equal(r.found, false);
  assert.deepEqual(r.domains, []);
  assert.deepEqual(r.providers, []);
});

test('scannable file types: html, js/ts/jsx/tsx/mjs/cjs/svelte/vue, json', () => {
  const r = scanForBaas(
    files({
      'a.html': 'https://a.supabase.co',
      'b.ts': 'https://b.supabase.co',
      'c.tsx': 'https://c.supabase.co',
      'd.svelte': 'https://d.supabase.co',
      'e.json': '{"url":"https://e.supabase.co"}',
    }),
  );
  assert.equal(r.domains.length, 5);
});

test('non-code assets are skipped', () => {
  const r = scanForBaas(
    files({
      'image.png': 'https://evil.supabase.co',
      'bin.wasm': 'https://evil.firebaseio.com',
      'fonts.woff': 'https://evil.clerk.com',
    }),
  );
  assert.equal(r.found, false);
});

test('dedupes + sorts domains', () => {
  const r = scanForBaas(
    files({
      'a.js': 'https://z.supabase.co https://a.supabase.co',
      'b.js': 'https://a.supabase.co',
    }),
  );
  assert.deepEqual(r.domains, ['a.supabase.co', 'z.supabase.co']);
});

test('per-file size cap: scans head of huge files only', () => {
  // Pad 6 MB of garbage then stick the URL at position 0 — still found.
  const head = Buffer.from('fetch("https://abc.supabase.co/x");');
  const pad = Buffer.alloc(6 * 1024 * 1024, 0x20);
  const huge = Buffer.concat([head, pad]);
  const r = scanForBaas(files({ 'huge.js': huge }));
  assert.ok(r.domains.includes('abc.supabase.co'));
});

test('per-file size cap: BaaS URL past the 5MB head is not scanned', () => {
  const pad = Buffer.alloc(5 * 1024 * 1024, 0x20);
  const tail = Buffer.from('fetch("https://late.supabase.co/x");');
  const huge = Buffer.concat([pad, tail]);
  const r = scanForBaas(files({ 'huge.js': huge }));
  assert.equal(r.found, false);
});

test('wildcard apex does not match on its own (*.x.y should not match x.y)', () => {
  // "supabase.co" alone isn't a tenant; guard against pattern drift.
  assert.equal(matchProvider('supabase.co'), null);
  assert.equal(matchProvider('clerk.com'), null);
});

test('matchProvider: exact and wildcard', () => {
  assert.equal(matchProvider('firebasestorage.googleapis.com')?.name, 'Firebase');
  assert.equal(matchProvider('abc.supabase.co')?.name, 'Supabase');
  assert.equal(matchProvider('nope.example.com'), null);
});

test('empty file map returns empty', () => {
  const r = scanForBaas(new Map());
  assert.equal(r.found, false);
  assert.equal(r.domains.length, 0);
});

test('upstash / planetscale / neon / vercel-storage all recognized', () => {
  const r = scanForBaas(
    files({
      'app.js':
        'fetch("https://us1-fine-cat-123.upstash.io/get"); fetch("https://aws.connect.psdb.cloud/x"); fetch("https://ep-abc.neon.tech/y"); fetch("https://foo.public.blob.vercel-storage.com/z");',
    }),
  );
  assert.ok(r.providers.includes('Upstash'));
  assert.ok(r.providers.includes('PlanetScale'));
  assert.ok(r.providers.includes('Neon'));
  assert.ok(r.providers.includes('Vercel Storage'));
});
