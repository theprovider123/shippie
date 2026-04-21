// packages/sdk/src/wrapper/iab-bounce.test.ts
import { describe, expect, test } from 'bun:test';
import { buildBounceTarget, type BounceInput } from './iab-bounce.ts';

describe('buildBounceTarget', () => {
  test('ios opens x-safari-https://', () => {
    const input: BounceInput = {
      platform: 'ios',
      currentUrl: 'https://shippie.app/apps/zen',
    };
    expect(buildBounceTarget(input)).toEqual({
      scheme: 'x-safari-https',
      url: 'x-safari-https://shippie.app/apps/zen',
    });
  });

  test('ios http URL still uses x-safari-https (upgrades to https)', () => {
    const input: BounceInput = {
      platform: 'ios',
      currentUrl: 'http://shippie.app/apps/zen',
    };
    const iosResult = buildBounceTarget(input);
    expect(iosResult).not.toBeNull();
    expect(iosResult!.scheme).toBe('x-safari-https');
  });

  test('android uses intent://', () => {
    const input: BounceInput = {
      platform: 'android',
      currentUrl: 'https://shippie.app/apps/zen?utm=x',
    };
    const result = buildBounceTarget(input);
    expect(result).not.toBeNull();
    expect(result!.scheme).toBe('intent');
    expect(result!.url).toBe(
      'intent://shippie.app/apps/zen?utm=x#Intent;scheme=https;package=com.android.chrome;end',
    );
  });

  test('android preserves query string and hash', () => {
    const input: BounceInput = {
      platform: 'android',
      currentUrl: 'https://a.shippie.app/page?q=1#section',
    };
    const result = buildBounceTarget(input);
    expect(result).not.toBeNull();
    expect(result!.url).toBe(
      'intent://a.shippie.app/page?q=1#Intent;scheme=https;package=com.android.chrome;end',
    );
  });

  test('desktop platform has no bounce scheme', () => {
    const input: BounceInput = {
      platform: 'desktop',
      currentUrl: 'https://shippie.app',
    };
    expect(buildBounceTarget(input)).toBeNull();
  });
});
