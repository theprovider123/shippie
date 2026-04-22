// apps/web/app/components/install-runtime.test.tsx
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { InstallRuntime } from './install-runtime.tsx';
import { renderToString } from 'react-dom/server';

let win: Window;

// Snapshot originals so teardown can restore them — bun test runs files in
// the same process, so leaving happy-dom's Window stuck on globalThis
// breaks downstream tests (e.g. anything that calls encodeURIComponent).
const originalWindow = (globalThis as { window?: unknown }).window;
const originalDocument = (globalThis as { document?: unknown }).document;

beforeEach(() => {
  win = new Window({ url: 'https://shippie.app/' });
  // @ts-expect-error injecting happy-dom globals for the component under test
  globalThis.document = win.document;
  // @ts-expect-error injecting happy-dom globals for the component under test
  globalThis.window = win;
});

afterEach(() => {
  // Clean up DOM between tests so each starts fresh.
  win.document.body.innerHTML = '';
});

afterAll(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
  (globalThis as { document?: unknown }).document = originalDocument;
});

describe('InstallRuntime SSR', () => {
  test('renders nothing on the server (returns null)', () => {
    const html = renderToString(<InstallRuntime />);
    expect(html).toBe('');
  });
});
