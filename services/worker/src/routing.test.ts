import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAppSlug } from './routing.ts';

function req(host: string): Request {
  return new Request('http://example.com/', { headers: { host } });
}

test('resolveAppSlug: *.shippie.app → subdomain', () => {
  assert.equal(resolveAppSlug(req('recipes.shippie.app')), 'recipes');
  assert.equal(resolveAppSlug(req('hello-world.shippie.app')), 'hello-world');
});

test('resolveAppSlug: shippie.app root → null', () => {
  assert.equal(resolveAppSlug(req('shippie.app')), null);
});

test('resolveAppSlug: *.localhost → subdomain (with and without port)', () => {
  assert.equal(resolveAppSlug(req('recipes.localhost')), 'recipes');
  assert.equal(resolveAppSlug(req('recipes.localhost:4200')), 'recipes');
});

test('resolveAppSlug: bare localhost → null', () => {
  assert.equal(resolveAppSlug(req('localhost:4200')), null);
  assert.equal(resolveAppSlug(req('localhost')), null);
});

test('resolveAppSlug: multi-segment shippie.app (unusual but allowed)', () => {
  assert.equal(resolveAppSlug(req('foo.bar.shippie.app')), 'foo.bar');
});

test('resolveAppSlug: unknown host → null', () => {
  assert.equal(resolveAppSlug(req('example.com')), null);
  assert.equal(resolveAppSlug(req('foo.example.com')), null);
});

test('resolveAppSlug: missing host header → null', () => {
  const r = new Request('http://example.com/');
  r.headers.delete('host');
  assert.equal(resolveAppSlug(r), null);
});

test('resolveAppSlug: *.nip.io (dashed IP) → first label', () => {
  assert.equal(resolveAppSlug(req('recipes.192-168-1-42.nip.io')), 'recipes');
  assert.equal(resolveAppSlug(req('recipes.192-168-1-42.nip.io:4200')), 'recipes');
});

test('resolveAppSlug: *.nip.io (dotted IP) → first label', () => {
  assert.equal(resolveAppSlug(req('recipes.10.0.0.5.nip.io')), 'recipes');
});

test('resolveAppSlug: bare nip.io or too-short → null', () => {
  assert.equal(resolveAppSlug(req('nip.io')), null);
});
