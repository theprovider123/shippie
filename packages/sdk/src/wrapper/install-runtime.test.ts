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

  test('manual install CTA opens the guided sheet', () => {
    setUa(ANDROID_UA);
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
    const installBtn = win.document.querySelector(
      'button[data-shippie-install]',
    ) as unknown as HTMLButtonElement | null;
    expect(installBtn?.textContent?.toLowerCase()).toContain('show me');
    installBtn?.click();

    const guide = win.document.querySelector('[data-shippie-banner][data-shippie-guide]');
    expect(guide).not.toBeNull();
    expect(guide?.getAttribute('data-shippie-tier')).toBe('full');
    expect(guide?.textContent).toContain('Open the browser menu');
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
  test('mounts the handoff sheet on desktop (non-IAB, non-standalone)', async () => {
    // Set desktop UA — no iPhone, no Android, no IAB signals.
    setUa(DESKTOP_UA);
    const cleanup = startInstallRuntime({ tickMs: 9_999_999 });
    // Desktop branch is async — wait for the handoff sheet to mount.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
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
    // Desktop branch is async — wait for the handoff sheet to mount.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
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

describe('web-vitals wiring', () => {
  test('vitals samples flush through the beacon endpoint', async () => {
    setUa(ANDROID_UA);
    // Prior state so tier is not "none" — ensures we're in the default
    // (mobile banner) branch where vitals are attached.
    const prior = {
      visit_count: 2,
      first_visit_at: Date.now() - 60 * 60 * 1000,
      last_visit_at: Date.now() - 60 * 60 * 1000,
      dwell_ms: 0,
      meaningful_actions: 0,
      last_dismissed_at: null,
    };
    win.localStorage.setItem('shippie-install-state', JSON.stringify(prior));

    // Capture beacon posts — sendBeacon is the preferred channel.
    const beacons: { url: string; body: string }[] = [];
    (win.navigator as unknown as { sendBeacon: (u: string, b: string) => boolean }).sendBeacon = (
      url: string,
      body: string,
    ) => {
      beacons.push({ url: String(url), body: String(body) });
      return true;
    };

    const flushHandle: { flush?: () => void } = {};
    const cleanup = startInstallRuntime({
      trackEndpoint: '/__shippie/install',
      tickMs: 9_999_999,
      vitalsFlushHandle: flushHandle,
    });

    // Observer attaches asynchronously? No — observeWebVitals is sync, but
    // flushHandle.flush is only assigned once inside it. Should already be set.
    expect(typeof flushHandle.flush).toBe('function');
    flushHandle.flush?.();

    // Find at least one web_vital beacon (CLS always emits since it's a sum).
    const vital = beacons.find((b) => {
      try {
        return JSON.parse(b.body).event === 'web_vital';
      } catch {
        return false;
      }
    });
    expect(vital).toBeTruthy();
    expect(vital?.url).toBe('/__shippie/install');
    const payload = JSON.parse(vital!.body);
    expect(payload.event).toBe('web_vital');
    expect(typeof payload.name).toBe('string');
    expect(typeof payload.value).toBe('number');

    cleanup();
  });
});

describe('referral attribution', () => {
  test('ref from URL rides along on install beacons', () => {
    // Rebuild window with ?ref=test-source in the URL so the runtime can
    // capture it. happy-dom's Window accepts a url option in its config.
    win = new Window({ url: 'https://shippie.app/apps/zen?ref=test-source' });
    // @ts-expect-error re-injecting happy-dom globals
    globalThis.document = win.document;
    // @ts-expect-error re-injecting happy-dom globals
    globalThis.window = win;
    // @ts-expect-error happy-dom Navigator is a subset
    globalThis.navigator = win.navigator;
    globalThis.localStorage = win.localStorage;

    setUa(ANDROID_UA);
    // Prior state forces tier=soft so a banner is mounted → prompt_dismissed
    // fires on dismiss, which is the cleanest install-funnel beacon to
    // inspect. Other events (prompt_shown via onInstall) require a
    // deferredPrompt which is not trivial to stub here.
    const prior = {
      visit_count: 2,
      first_visit_at: Date.now() - 60 * 60 * 1000,
      last_visit_at: Date.now() - 60 * 60 * 1000,
      dwell_ms: 0,
      meaningful_actions: 0,
      last_dismissed_at: null,
    };
    win.localStorage.setItem('shippie-install-state', JSON.stringify(prior));

    const beacons: { url: string; body: string }[] = [];
    (win.navigator as unknown as { sendBeacon: (u: string, b: string) => boolean }).sendBeacon = (
      url: string,
      body: string,
    ) => {
      beacons.push({ url: String(url), body: String(body) });
      return true;
    };

    const cleanup = startInstallRuntime({
      trackEndpoint: '/__shippie/install',
      tickMs: 9_999_999,
    });

    // Trigger a dismiss — fires prompt_dismissed, which should carry ref.
    const dismissBtn = win.document.querySelector(
      '[data-shippie-dismiss]',
    ) as unknown as HTMLButtonElement | null;
    expect(dismissBtn).not.toBeNull();
    dismissBtn!.click();

    const dismissBeacon = beacons.find((b) => {
      try {
        return JSON.parse(b.body).event === 'prompt_dismissed';
      } catch {
        return false;
      }
    });
    expect(dismissBeacon).toBeTruthy();
    const payload = JSON.parse(dismissBeacon!.body);
    expect(payload.ref).toBe('test-source');

    cleanup();
    // Clean up the referral key since tests share happy-dom state.
    win.localStorage.removeItem('shippie-referral-source');
  });
});

describe('desktop handoff push-aware CTA', () => {
  function stubPushManager(hasSubscription: boolean): void {
    // Install window.PushManager — pushSupported() requires both
    // serviceWorker on navigator AND PushManager on window.
    (win as unknown as { PushManager: unknown }).PushManager = function PushManager() {};

    const fakeSubscription = hasSubscription ? { endpoint: 'https://fcm.example/abc' } : null;
    const fakeRegistration = {
      pushManager: {
        getSubscription: async () => fakeSubscription,
      },
    };
    // serviceWorker is a getter on happy-dom's Navigator — replace with a stub.
    Object.defineProperty(win.navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve(fakeRegistration) },
    });
    // Mirror onto globalThis since the runtime reads the bare `navigator`.
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve(fakeRegistration) },
    });
    (globalThis as unknown as { PushManager: unknown }).PushManager =
      (win as unknown as { PushManager: unknown }).PushManager;
  }

  afterEach(() => {
    // Scrub the global PushManager we planted so later tests start clean.
    try {
      delete (globalThis as { PushManager?: unknown }).PushManager;
    } catch {
      /* ignore */
    }
  });

  test('mounts push CTA when an existing subscription exists', async () => {
    setUa(DESKTOP_UA);
    stubPushManager(true);

    const cleanup = startInstallRuntime({ tickMs: 9_999_999 });
    // Desktop branch is async — wait multiple microtasks for ready + getSubscription.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(win.document.querySelector('[data-shippie-handoff]')).not.toBeNull();
    expect(win.document.querySelector('[data-shippie-handoff-push-cta]')).not.toBeNull();
    cleanup();
  });

  test('no push CTA when no subscription exists', async () => {
    setUa(DESKTOP_UA);
    stubPushManager(false);

    const cleanup = startInstallRuntime({ tickMs: 9_999_999 });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(win.document.querySelector('[data-shippie-handoff]')).not.toBeNull();
    expect(win.document.querySelector('[data-shippie-handoff-push-cta]')).toBeNull();
    cleanup();
  });
});
