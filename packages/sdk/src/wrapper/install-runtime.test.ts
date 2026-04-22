// packages/sdk/src/wrapper/install-runtime.test.ts
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { startInstallRuntime } from './install-runtime.ts';

let win: Window;

// Snapshot originals so teardown can restore them — bun test runs files
// in the same process, so leaving happy-dom's globals on globalThis leaks
// into downstream test files that reference the real browser APIs.
const originalWindow = (globalThis as { window?: unknown }).window;
const originalDocument = (globalThis as { document?: unknown }).document;
const originalNavigator = (globalThis as { navigator?: unknown }).navigator;
const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
const originalFetch = (globalThis as { fetch?: unknown }).fetch;

// UAs used to steer `detectPlatform` in tests. happy-dom's default UA is
// a desktop string, which now routes to the handoff branch — so tests that
// want the mobile banner branch must override to an Android UA.
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function setUa(ua: string): void {
  Object.defineProperty(win.navigator, 'userAgent', {
    value: ua,
    configurable: true,
  });
}

beforeEach(() => {
  win = new Window({ url: 'https://shippie.app/' });
  // @ts-expect-error injecting happy-dom globals for the runtime under test
  globalThis.document = win.document;
  // @ts-expect-error injecting happy-dom globals for the runtime under test
  globalThis.window = win;
  // @ts-expect-error happy-dom's Navigator is a subset of DOM lib's Navigator
  globalThis.navigator = win.navigator;
  globalThis.localStorage = win.localStorage;
});

afterEach(() => {
  win.document.body.innerHTML = '';
  win.localStorage.clear();
  (globalThis as { fetch?: unknown }).fetch = originalFetch;
});

afterAll(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
  (globalThis as { document?: unknown }).document = originalDocument;
  (globalThis as { navigator?: unknown }).navigator = originalNavigator;
  (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
  (globalThis as { fetch?: unknown }).fetch = originalFetch;
});

describe('startInstallRuntime', () => {
  test('returns a no-op cleanup when window is undefined', () => {
    // @ts-expect-error delete injected global
    delete globalThis.window;
    const cleanup = startInstallRuntime();
    expect(typeof cleanup).toBe('function');
    // should not throw
    cleanup();
  });

  test('first visit with no dwell → no banner mounted (tier=none)', () => {
    setUa(ANDROID_UA);
    const cleanup = startInstallRuntime({ tickMs: 9_999_999 });
    expect(win.document.querySelector('[data-shippie-banner]')).toBeNull();
    cleanup();
  });

  test('second visit mounts a soft banner', () => {
    setUa(ANDROID_UA);
    // Simulate a prior visit ended >30 min ago.
    const prior = {
      visit_count: 1,
      first_visit_at: Date.now() - 60 * 60 * 1000,
      last_visit_at: Date.now() - 60 * 60 * 1000,
      dwell_ms: 0,
      meaningful_actions: 0,
      last_dismissed_at: null,
    };
    win.localStorage.setItem('shippie-install-state', JSON.stringify(prior));

    const cleanup = startInstallRuntime({ tickMs: 9_999_999 });
    const banner = win.document.querySelector('[data-shippie-banner]');
    expect(banner).not.toBeNull();
    expect(banner?.getAttribute('data-shippie-tier')).toBe('soft');
    cleanup();
  });

  test('cleanup removes the banner from the DOM', () => {
    setUa(ANDROID_UA);
    const prior = {
      visit_count: 2,
      first_visit_at: Date.now() - 60 * 60 * 1000,
      last_visit_at: Date.now() - 60 * 60 * 1000,
      dwell_ms: 0,
      meaningful_actions: 0,
      last_dismissed_at: null,
    };
    win.localStorage.setItem('shippie-install-state', JSON.stringify(prior));

    const cleanup = startInstallRuntime({ tickMs: 9_999_999 });
    expect(win.document.querySelector('[data-shippie-banner]')).not.toBeNull();
    cleanup();
    expect(win.document.querySelector('[data-shippie-banner]')).toBeNull();
  });
});

describe('desktop handoff branch', () => {
  test('mounts the handoff sheet on desktop (non-IAB, non-standalone)', () => {
    // Set desktop UA — no iPhone, no Android, no IAB signals.
    setUa(DESKTOP_UA);
    const cleanup = startInstallRuntime({ tickMs: 9_999_999 });
    expect(win.document.querySelector('[data-shippie-handoff]')).not.toBeNull();
    expect(win.document.querySelector('[data-shippie-banner]')).toBeNull();
    cleanup();
    expect(win.document.querySelector('[data-shippie-handoff]')).toBeNull();
  });

  test('email CTA posts to handoffEndpoint', async () => {
    setUa(DESKTOP_UA);
    const posted: { url: string; body: string }[] = [];
    (globalThis as { fetch?: unknown }).fetch = async (url: string | URL, init?: { body?: string }) => {
      posted.push({ url: url.toString(), body: String(init?.body ?? '') });
      return new Response('', { status: 200 });
    };
    const cleanup = startInstallRuntime({ handoffEndpoint: '/__shippie/handoff', tickMs: 9_999_999 });
    const input = win.document.querySelector('input[data-shippie-handoff-email]') as unknown as HTMLInputElement;
    input.value = 'me@example.com';
    const cta = win.document.querySelector('button[data-shippie-handoff-email-cta]') as unknown as HTMLButtonElement;
    cta.click();
    // Wait two microtasks — the click handler awaits validateEmail + fetch.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(posted.length).toBe(1);
    expect(posted[0]?.url).toBe('/__shippie/handoff');
    expect(JSON.parse(posted[0]!.body).mode).toBe('email');
    cleanup();
  });
});
