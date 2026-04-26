import { describe, expect, it } from 'vitest';
import { createLucia } from './lucia';

/**
 * Mock D1Database — `getSessionAndUser`-shaped queries are the only D1 method
 * Lucia hits when validating; we don't exercise that here. We just check
 * Lucia constructor wiring + cookie config.
 */
function mockDb(): unknown {
  return {
    prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) }) }),
    batch: async () => [],
    exec: async () => ({}),
    dump: async () => new ArrayBuffer(0),
  };
}

describe('createLucia', () => {
  it('uses shippie_session as the cookie name', () => {
    const lucia = createLucia(mockDb() as never, { SHIPPIE_ENV: 'production' });
    expect(lucia.sessionCookieName).toBe('shippie_session');
  });

  it('sets secure cookie + .shippie.app domain in production', () => {
    const lucia = createLucia(mockDb() as never, { SHIPPIE_ENV: 'production' });
    const cookie = lucia.createSessionCookie('abc123');
    expect(cookie.attributes.secure).toBe(true);
    expect(cookie.attributes.domain).toBe('.shippie.app');
    expect(cookie.attributes.sameSite).toBe('lax');
    expect(cookie.attributes.path).toBe('/');
  });

  it('sets secure cookie + .shippie.app domain in canary', () => {
    const lucia = createLucia(mockDb() as never, { SHIPPIE_ENV: 'canary' });
    const cookie = lucia.createSessionCookie('abc123');
    expect(cookie.attributes.secure).toBe(true);
    expect(cookie.attributes.domain).toBe('.shippie.app');
  });

  it('uses host-only insecure cookie in dev', () => {
    const lucia = createLucia(mockDb() as never, { SHIPPIE_ENV: 'development' });
    const cookie = lucia.createSessionCookie('abc123');
    expect(cookie.attributes.secure).toBe(false);
    expect(cookie.attributes.domain).toBeUndefined();
  });

  it('createBlankSessionCookie returns a clearing cookie', () => {
    const lucia = createLucia(mockDb() as never, { SHIPPIE_ENV: 'production' });
    const blank = lucia.createBlankSessionCookie();
    expect(blank.name).toBe('shippie_session');
    // Empty value + max-age 0 is how Lucia signals "delete me".
    expect(blank.value).toBe('');
  });
});
