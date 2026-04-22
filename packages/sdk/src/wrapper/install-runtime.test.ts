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
});

afterAll(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
  (globalThis as { document?: unknown }).document = originalDocument;
  (globalThis as { navigator?: unknown }).navigator = originalNavigator;
  (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
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
    const cleanup = startInstallRuntime({ tickMs: 9_999_999 });
    expect(win.document.querySelector('[data-shippie-banner]')).toBeNull();
    cleanup();
  });

  test('second visit mounts a soft banner', () => {
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
