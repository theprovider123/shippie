// packages/sdk/src/wrapper/detect.test.ts
import { describe, expect, test } from 'bun:test';
import {
  detectInstallMethod,
  detectIab,
  detectPlatform,
  type InstallContext,
} from './detect.ts';

const UA = {
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0 Mobile/15E148 Safari/604.1',
  iosFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/125.0 Mobile/15E148 Safari/604.1',
  iosGsa:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 GSA/309.0.12345 Safari/604.1',
  iosDuckDuckGo:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 DuckDuckGo/7',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Instagram 333.0.0.33.111 (iPhone15,3)',
  facebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/500.0.0.33.106]',
  tiktok:
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile musical_ly_28.0.0 trill_280000',
  twitter:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Twitter for iPhone/10.45',
  linkedin:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 LinkedInApp/9.29.6210',
  whatsapp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 WhatsApp/24.5.83',
} as const;

describe('detectPlatform', () => {
  test('ios from iPhone UA', () => {
    expect(detectPlatform(UA.iosSafari)).toBe('ios');
  });
  test('android from Pixel UA', () => {
    expect(detectPlatform(UA.androidChrome)).toBe('android');
  });
  test('desktop from Mac UA', () => {
    expect(detectPlatform(UA.desktopChrome)).toBe('desktop');
  });
});

describe('detectInstallMethod', () => {
  test('ios-safari → ios-safari', () => {
    expect(detectInstallMethod(UA.iosSafari)).toBe('ios-safari');
  });
  test('ios-chrome → ios-chrome', () => {
    expect(detectInstallMethod(UA.iosChrome)).toBe('ios-chrome');
  });
  test('ios-firefox → ios-other', () => {
    expect(detectInstallMethod(UA.iosFirefox)).toBe('ios-other');
  });
  test('ios Google Search App → ios-other (not ios-safari)', () => {
    expect(detectInstallMethod(UA.iosGsa)).toBe('ios-other');
  });
  test('ios DuckDuckGo → ios-other (not ios-safari)', () => {
    expect(detectInstallMethod(UA.iosDuckDuckGo)).toBe('ios-other');
  });
  test('android → manual (until beforeinstallprompt upgrades it)', () => {
    expect(detectInstallMethod(UA.androidChrome)).toBe('manual');
  });
  test('desktop chrome → manual', () => {
    expect(detectInstallMethod(UA.desktopChrome)).toBe('manual');
  });
});

describe('detectIab', () => {
  test.each([
    ['instagram', UA.instagram, 'instagram'],
    ['facebook', UA.facebook, 'facebook'],
    ['tiktok', UA.tiktok, 'tiktok'],
    ['twitter', UA.twitter, 'twitter'],
    ['linkedin', UA.linkedin, 'linkedin'],
    ['whatsapp', UA.whatsapp, 'whatsapp'],
  ] as const)('%s detected as %s', (_, ua, expected) => {
    expect(detectIab(ua)).toBe(expected);
  });

  test('plain iOS Safari is not an IAB', () => {
    expect(detectIab(UA.iosSafari)).toBeNull();
  });
  test('plain Android Chrome is not an IAB', () => {
    expect(detectIab(UA.androidChrome)).toBeNull();
  });
});

describe('InstallContext type surface (compile-time)', () => {
  test('exports the type', () => {
    const _ctx: InstallContext = {
      platform: 'ios',
      method: 'ios-safari',
      iab: null,
      standalone: false,
    };
    expect(_ctx.platform).toBe('ios');
  });
});
