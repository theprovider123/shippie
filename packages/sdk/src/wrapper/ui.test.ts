// packages/sdk/src/wrapper/ui.test.ts
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { mountInstallBanner, mountBounceSheet, unmountAll } from './ui.ts';

let win: Window;

// Snapshot originals so teardown can restore them — bun test runs files
// in the same process, so leaving happy-dom's Window on globalThis leaks
// into downstream test files.
const originalWindow = (globalThis as { window?: unknown }).window;
const originalDocument = (globalThis as { document?: unknown }).document;

beforeEach(() => {
  win = new Window({ url: 'https://shippie.app/' });
  // @ts-expect-error injecting happy-dom globals for the module under test
  globalThis.document = win.document;
  // @ts-expect-error injecting happy-dom globals for the module under test
  globalThis.window = win;
});

afterAll(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
  (globalThis as { document?: unknown }).document = originalDocument;
});

describe('mountInstallBanner', () => {
  test('renders a soft banner that opens the install flow', () => {
    mountInstallBanner({ tier: 'soft', onInstall: () => {}, onDismiss: () => {} });
    const banner = win.document.querySelector('[data-shippie-banner]');
    expect(banner).not.toBeNull();
    const btn = banner?.querySelector('button[data-shippie-install]');
    expect(btn?.textContent?.toLowerCase()).toContain('show me');
  });

  test('renders nothing when tier=none', () => {
    mountInstallBanner({ tier: 'none', onInstall: () => {}, onDismiss: () => {} });
    const banner = win.document.querySelector('[data-shippie-banner]');
    expect(banner).toBeNull();
  });

  test('is idempotent — second mount does not create a duplicate', () => {
    mountInstallBanner({ tier: 'soft', onInstall: () => {}, onDismiss: () => {} });
    mountInstallBanner({ tier: 'soft', onInstall: () => {}, onDismiss: () => {} });
    expect(win.document.querySelectorAll('[data-shippie-banner]')).toHaveLength(1);
  });

  test('renders full tier as a guided install sheet', () => {
    mountInstallBanner({
      tier: 'full',
      method: 'ios-safari',
      platform: 'ios',
      appName: 'Shippie',
      onInstall: () => {},
      onDismiss: () => {},
    });
    const sheet = win.document.querySelector('[data-shippie-banner][data-shippie-guide]');
    expect(sheet).not.toBeNull();
    expect(sheet?.textContent).toContain('Add Shippie to Home Screen');
    expect(sheet?.textContent).toContain('Share button');
    expect(sheet?.querySelectorAll('[data-shippie-install-steps] li').length).toBe(3);
  });

  test('install button invokes onInstall', () => {
    let called = 0;
    mountInstallBanner({
      tier: 'soft',
      onInstall: () => {
        called += 1;
      },
      onDismiss: () => {},
    });
    const btn = win.document.querySelector('button[data-shippie-install]') as unknown as HTMLButtonElement;
    btn.click();
    expect(called).toBe(1);
  });
});

describe('mountBounceSheet', () => {
  test('renders a sheet with a primary CTA', () => {
    mountBounceSheet({
      brand: 'instagram',
      target: { scheme: 'x-safari-https', url: 'x-safari-https://shippie.app/' },
      onBounce: () => {},
      onCopyLink: () => {},
    });
    const sheet = win.document.querySelector('[data-shippie-bounce]');
    expect(sheet).not.toBeNull();
    const cta = sheet?.querySelector('a[data-shippie-bounce-cta]');
    expect(cta?.getAttribute('href')).toBe('x-safari-https://shippie.app/');
  });

  test('copy-link button invokes onCopyLink', () => {
    let called = 0;
    mountBounceSheet({
      brand: 'instagram',
      target: { scheme: 'x-safari-https', url: 'x-safari-https://shippie.app/' },
      onBounce: () => {},
      onCopyLink: () => {
        called += 1;
      },
    });
    const copy = win.document.querySelector('button[data-shippie-bounce-copy]') as unknown as HTMLButtonElement;
    copy.click();
    expect(called).toBe(1);
  });
});

describe('unmountAll', () => {
  test('removes both banner and bounce sheet', () => {
    mountInstallBanner({ tier: 'soft', onInstall: () => {}, onDismiss: () => {} });
    mountBounceSheet({
      brand: 'instagram',
      target: { scheme: 'x-safari-https', url: 'x-safari-https://shippie.app/' },
      onBounce: () => {},
      onCopyLink: () => {},
    });
    unmountAll();
    expect(win.document.querySelector('[data-shippie-banner]')).toBeNull();
    expect(win.document.querySelector('[data-shippie-bounce]')).toBeNull();
  });
});
