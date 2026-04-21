// packages/sdk/src/wrapper/handoff.test.ts
import { describe, expect, test } from 'bun:test';
import { buildHandoffUrl, validateEmail } from './handoff.ts';

describe('buildHandoffUrl', () => {
  test('appends ref=handoff when url has no query', () => {
    expect(buildHandoffUrl('https://shippie.app/apps/zen')).toBe(
      'https://shippie.app/apps/zen?ref=handoff',
    );
  });

  test('appends ref=handoff when url has query', () => {
    expect(buildHandoffUrl('https://shippie.app/apps/zen?x=1')).toBe(
      'https://shippie.app/apps/zen?x=1&ref=handoff',
    );
  });

  test('does not duplicate ref param if already present', () => {
    expect(buildHandoffUrl('https://shippie.app/?ref=abc')).toBe(
      'https://shippie.app/?ref=abc',
    );
  });

  test('preserves hash fragment', () => {
    expect(buildHandoffUrl('https://shippie.app/apps/zen#section')).toBe(
      'https://shippie.app/apps/zen?ref=handoff#section',
    );
  });
});

describe('validateEmail', () => {
  test('accepts a well-formed email', () => {
    expect(validateEmail('user@example.com')).toBe(true);
    expect(validateEmail('a+b@c.co.uk')).toBe(true);
  });

  test('rejects empty', () => {
    expect(validateEmail('')).toBe(false);
    expect(validateEmail('   ')).toBe(false);
  });

  test('rejects missing @', () => {
    expect(validateEmail('userexample.com')).toBe(false);
  });

  test('rejects missing tld', () => {
    expect(validateEmail('user@localhost')).toBe(false);
  });

  test('trims surrounding whitespace', () => {
    expect(validateEmail('  user@example.com  ')).toBe(true);
  });
});
