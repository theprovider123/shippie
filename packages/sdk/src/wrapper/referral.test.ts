// packages/sdk/src/wrapper/referral.test.ts
/**
 * Referral capture tests. Drives a happy-dom localStorage through the
 * capture/read/clear lifecycle + verifies buildInviteLink compose rules.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import {
  buildInviteLink,
  captureReferral,
  clearReferral,
  readStoredReferral,
} from './referral.ts';

let win: Window;

const originalWindow = (globalThis as { window?: unknown }).window;
const originalDocument = (globalThis as { document?: unknown }).document;
const originalNavigator = (globalThis as { navigator?: unknown }).navigator;
const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

beforeEach(() => {
  win = new Window({ url: 'https://shippie.app/' });
  // @ts-expect-error injecting happy-dom globals
  globalThis.document = win.document;
  // @ts-expect-error injecting happy-dom globals
  globalThis.window = win;
  // @ts-expect-error happy-dom Navigator is a subset
  globalThis.navigator = win.navigator;
  globalThis.localStorage = win.localStorage;
});

afterEach(() => {
  win.localStorage.clear();
});

afterAll(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
  (globalThis as { document?: unknown }).document = originalDocument;
  (globalThis as { navigator?: unknown }).navigator = originalNavigator;
  (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
});

describe('captureReferral', () => {
  test('no ref in URL returns null when nothing stored', () => {
    const result = captureReferral('https://shippie.app/apps/zen');
    expect(result).toBeNull();
  });

  test('no ref in URL returns stored record when present', () => {
    win.localStorage.setItem(
      'shippie-referral-source',
      JSON.stringify({ source: 'category-top-rated', capturedAt: Date.now() }),
    );
    const result = captureReferral('https://shippie.app/apps/zen');
    expect(result?.source).toBe('category-top-rated');
  });

  test('writes the ref to localStorage and returns it', () => {
    const result = captureReferral(
      'https://shippie.app/apps/zen?ref=category-top-rated',
    );
    expect(result?.source).toBe('category-top-rated');
    const raw = win.localStorage.getItem('shippie-referral-source');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.source).toBe('category-top-rated');
    expect(typeof parsed.capturedAt).toBe('number');
  });

  test('truncates ref to 64 chars', () => {
    const long = 'x'.repeat(200);
    const result = captureReferral(
      `https://shippie.app/apps/zen?ref=${long}`,
    );
    expect(result?.source.length).toBe(64);
  });

  test('expired stored record is wiped on read', () => {
    const oldAt = Date.now() - 10 * 86_400_000; // 10 days ago
    win.localStorage.setItem(
      'shippie-referral-source',
      JSON.stringify({ source: 'old-source', capturedAt: oldAt }),
    );
    const result = readStoredReferral(); // default 7-day ttl
    expect(result).toBeNull();
    expect(win.localStorage.getItem('shippie-referral-source')).toBeNull();
  });

  test('empty ref treated as absent', () => {
    const result = captureReferral('https://shippie.app/apps/zen?ref=');
    expect(result).toBeNull();
  });

  test('whitespace-only ref treated as absent', () => {
    const result = captureReferral(
      'https://shippie.app/apps/zen?ref=%20%20%20',
    );
    expect(result).toBeNull();
  });

  test('malformed URL returns null without throwing', () => {
    const result = captureReferral('not-a-url');
    expect(result).toBeNull();
  });

  test('custom param name honored', () => {
    const result = captureReferral(
      'https://shippie.app/apps/zen?utm_source=twitter',
      { paramName: 'utm_source' },
    );
    expect(result?.source).toBe('twitter');
  });
});

describe('clearReferral', () => {
  test('removes the stored record', () => {
    captureReferral('https://shippie.app/apps/zen?ref=x');
    expect(win.localStorage.getItem('shippie-referral-source')).not.toBeNull();
    clearReferral();
    expect(win.localStorage.getItem('shippie-referral-source')).toBeNull();
  });

  test('is safe when nothing is stored', () => {
    expect(() => clearReferral()).not.toThrow();
  });
});

describe('buildInviteLink', () => {
  test('composes ?ref and ?by params', () => {
    const link = buildInviteLink({
      baseUrl: 'https://shippie.app/apps/zen',
      source: 'homepage-invite',
      inviter: 'user_42',
    });
    const u = new URL(link);
    expect(u.searchParams.get('ref')).toBe('homepage-invite');
    expect(u.searchParams.get('by')).toBe('user_42');
  });

  test('omits missing params', () => {
    const link = buildInviteLink({ baseUrl: 'https://shippie.app/apps/zen' });
    const u = new URL(link);
    expect(u.searchParams.get('ref')).toBeNull();
    expect(u.searchParams.get('by')).toBeNull();
  });

  test('preserves existing query params on the base', () => {
    const link = buildInviteLink({
      baseUrl: 'https://shippie.app/apps/zen?utm_campaign=launch',
      source: 'homepage',
    });
    const u = new URL(link);
    expect(u.searchParams.get('utm_campaign')).toBe('launch');
    expect(u.searchParams.get('ref')).toBe('homepage');
  });
});
