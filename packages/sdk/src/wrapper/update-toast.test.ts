import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { mountUpdateToast, unmountUpdateToast } from './update-toast.ts';

let win: Window;
const originalDocument = (globalThis as { document?: unknown }).document;

beforeEach(() => {
  win = new Window({ url: 'https://shippie.app/' });
  // @ts-expect-error test
  globalThis.document = win.document;
});

afterAll(() => {
  (globalThis as { document?: unknown }).document = originalDocument;
});

describe('mountUpdateToast', () => {
  test('renders a toast with a Reload button', () => {
    let reloaded = 0;
    mountUpdateToast({ onReload: () => (reloaded += 1) });
    const toast = win.document.querySelector('[data-shippie-update]');
    expect(toast).not.toBeNull();
    const btn = toast?.querySelector('button[data-shippie-update-reload]') as unknown as HTMLButtonElement;
    btn?.click();
    expect(reloaded).toBe(1);
  });

  test('idempotent — mounting twice leaves one toast', () => {
    mountUpdateToast({ onReload: () => {} });
    mountUpdateToast({ onReload: () => {} });
    expect(win.document.querySelectorAll('[data-shippie-update]')).toHaveLength(1);
  });

  test('unmountUpdateToast removes the toast', () => {
    mountUpdateToast({ onReload: () => {} });
    unmountUpdateToast();
    expect(win.document.querySelector('[data-shippie-update]')).toBeNull();
  });
});
