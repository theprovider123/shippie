import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { local, load } from './local.ts';

let win: Window;
const originalWindow = (globalThis as any).window;
const originalDocument = (globalThis as any).document;

beforeEach(() => {
  win = new Window({ url: 'https://demo.shippie.app/' });
  (globalThis as any).window = win;
  (globalThis as any).document = win.document;
});

afterEach(() => {
  (globalThis as any).window = originalWindow;
  (globalThis as any).document = originalDocument;
});

describe('shippie.local loader', () => {
  test('returns existing runtime without injecting a script', async () => {
    (win as any).shippie = { local: { version: 'test-runtime', db: { query: () => [] } } };

    await expect(load()).resolves.toMatchObject({ version: 'test-runtime' });
    expect(win.document.querySelector('script[data-shippie-local-runtime]')).toBeNull();
    expect(local.db).toEqual({ query: expect.any(Function) });
  });

  test('injects same-origin local runtime script on demand', async () => {
    const pending = load();
    const script = win.document.querySelector('script[data-shippie-local-runtime]') as unknown as HTMLScriptElement;
    expect(script?.getAttribute('src')).toBe('/__shippie/local.js');

    (win as any).shippie = { local: { version: 'loaded', capabilities: () => ({ wasm: true }) } };
    script.dispatchEvent(new win.Event('load') as never);

    await expect(pending).resolves.toMatchObject({ version: 'loaded' });
    await expect(local.capabilities()).resolves.toEqual({ wasm: true });
  });
});
