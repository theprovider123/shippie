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
  test('schedules reload without rendering a prompt', async () => {
    let reloaded = 0;
    mountUpdateToast({ onReload: () => (reloaded += 1) });
    const toast = win.document.querySelector('[data-shippie-update]');
    expect(toast).toBeNull();
    await Promise.resolve();
    expect(reloaded).toBe(1);
  });

  test('idempotent — mounting twice in one tick schedules one reload', async () => {
    let reloaded = 0;
    mountUpdateToast({ onReload: () => (reloaded += 1) });
    mountUpdateToast({ onReload: () => (reloaded += 1) });
    await Promise.resolve();
    expect(reloaded).toBe(1);
  });

  test('unmountUpdateToast removes legacy toast nodes', () => {
    const host = win.document.createElement('div');
    host.setAttribute('data-shippie-update', '');
    win.document.body.append(host);
    unmountUpdateToast();
    expect(win.document.querySelector('[data-shippie-update]')).toBeNull();
  });
});
