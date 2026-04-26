import { describe, expect, test } from 'vitest';
import { resolveAppSlug } from './routing';

function reqWithHost(host: string): Request {
  return new Request('http://example/', { headers: { host } });
}

describe('resolveAppSlug', () => {
  test('chiwit.shippie.app → chiwit', () => {
    expect(resolveAppSlug(reqWithHost('chiwit.shippie.app'))).toBe('chiwit');
  });

  test('multi-label: foo.bar.shippie.app → foo.bar', () => {
    expect(resolveAppSlug(reqWithHost('foo.bar.shippie.app'))).toBe('foo.bar');
  });

  test('shippie.app (apex) → null', () => {
    expect(resolveAppSlug(reqWithHost('shippie.app'))).toBeNull();
  });

  test('next.shippie.app (canary) → null', () => {
    expect(resolveAppSlug(reqWithHost('next.shippie.app'))).toBeNull();
  });

  test('www.shippie.app → null', () => {
    expect(resolveAppSlug(reqWithHost('www.shippie.app'))).toBeNull();
  });

  test('ai.shippie.app → null (excluded)', () => {
    expect(resolveAppSlug(reqWithHost('ai.shippie.app'))).toBeNull();
  });

  test('chiwit.localhost → chiwit (dev)', () => {
    expect(resolveAppSlug(reqWithHost('chiwit.localhost'))).toBe('chiwit');
  });

  test('chiwit.192-168-1-100.nip.io → chiwit (LAN dev)', () => {
    expect(resolveAppSlug(reqWithHost('chiwit.192-168-1-100.nip.io'))).toBe(
      'chiwit'
    );
  });

  test('custom domain → null (needs async lookup)', () => {
    expect(resolveAppSlug(reqWithHost('mydomain.com'))).toBeNull();
  });

  test('preserves port-stripping', () => {
    expect(resolveAppSlug(reqWithHost('chiwit.localhost:4101'))).toBe('chiwit');
  });
});
