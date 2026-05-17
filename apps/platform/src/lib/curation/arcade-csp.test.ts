import { describe, expect, test } from 'vitest';
import { buildArcadeCsp, buildArcadeCspMetaTag } from './arcade-csp';

describe('buildArcadeCsp', () => {
  const csp = buildArcadeCsp();

  test('declares default-src self (no third-party CDN by default)', () => {
    expect(csp).toMatch(/default-src 'self';/);
  });

  test('allows wasm-unsafe-eval for Stockfish + future game wasm', () => {
    expect(csp).toMatch(/script-src 'self' 'wasm-unsafe-eval';/);
  });

  test('allows blob: workers (Stockfish creates one)', () => {
    expect(csp).toMatch(/worker-src 'self' blob:/);
  });

  test('allows both apex + wildcard wss for proximity rendezvous', () => {
    expect(csp).toMatch(/wss:\/\/shippie\.app/);
    expect(csp).toMatch(/wss:\/\/\*\.shippie\.app/);
  });

  test('denies frames + objects + base (no smuggling)', () => {
    expect(csp).toMatch(/frame-src 'none'/);
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/base-uri 'none'/);
  });

  test('does NOT permit third-party analytics or payment hosts', () => {
    for (const host of [
      'google-analytics.com',
      'doubleclick.net',
      'facebook.net',
      'mixpanel.com',
      'segment.io',
      'sentry.io',
      'paddle.com',
      'stripe.com',
    ]) {
      expect(csp).not.toContain(host);
    }
  });

  test('output is stable (idempotent)', () => {
    expect(buildArcadeCsp()).toBe(csp);
  });
});

describe('buildArcadeCspMetaTag', () => {
  test('wraps CSP in a meta http-equiv tag', () => {
    const tag = buildArcadeCspMetaTag();
    expect(tag).toContain('<meta http-equiv="Content-Security-Policy" content="');
    expect(tag).toContain(buildArcadeCsp());
    expect(tag).toMatch(/">$/);
  });
});
