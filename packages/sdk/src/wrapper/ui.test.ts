// packages/sdk/src/wrapper/ui.test.ts
import { beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { mountInstallBanner, mountBounceSheet, unmountAll } from './ui.ts';

let win: Window;
beforeEach(() => {
  win = new Window({ url: 'https://shippie.app/' });
  // @ts-expect-error injecting happy-dom globals for the module under test
  globalThis.document = win.document;
  // @ts-expect-error injecting happy-dom globals for the module under test
  globalThis.window = win;
});

describe('mountInstallBanner', () => {
  test('renders a banner with INSTALL button when tier=soft', () => {
    mountInstallBanner({ tier: 'soft', onInstall: () => {}, onDismiss: () => {} });
    const banner = win.document.querySelector('[data-shippie-banner]');
    expect(banner).not.toBeNull();
    const btn = banner?.querySelector('button[data-shippie-install]');
    expect(btn?.textContent?.toLowerCase()).toContain('install');
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
