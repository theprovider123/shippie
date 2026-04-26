/**
 * Pure-function tests for proxy.ts. The full reverse-proxy round-trip
 * lives in services/worker/src/router/proxy.test.ts (Bun-only because
 * it spins up a real upstream Bun.serve). Here we exercise the helpers
 * that don't require a runtime upstream.
 */
import { describe, expect, test } from 'vitest';
import {
  buildUpstreamUrl,
  rewriteLocation,
  stripCookieDomain
} from './proxy';

describe('proxy helpers', () => {
  test('buildUpstreamUrl preserves path + query against upstream origin', () => {
    expect(
      buildUpstreamUrl(
        'https://upstream.example/some/base',
        'https://chiwit.shippie.app/api/x?q=1'
      )
    ).toBe('https://upstream.example/api/x?q=1');
  });

  test('rewriteLocation: same-host abs URL → path-relative', () => {
    expect(
      rewriteLocation(
        'https://upstream.example/after',
        'https://upstream.example/'
      )
    ).toBe('/after');
  });

  test('rewriteLocation: cross-host stays absolute', () => {
    expect(
      rewriteLocation(
        'https://other.example/x',
        'https://upstream.example/'
      )
    ).toBe('https://other.example/x');
  });

  test('stripCookieDomain removes Domain= attribute, preserves Expires', () => {
    const out = stripCookieDomain(
      'sid=abc; Domain=upstream.example; Path=/; Expires=Wed, 09 Jun 2021 10:18:14 GMT'
    );
    expect(out).toContain('sid=abc');
    expect(out).toContain('Expires=Wed, 09 Jun 2021');
    expect(out.toLowerCase()).not.toContain('domain=');
  });
});
