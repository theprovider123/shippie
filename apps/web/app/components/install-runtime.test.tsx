// apps/web/app/components/install-runtime.test.tsx
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { InstallRuntime } from './install-runtime.tsx';
import { renderToString } from 'react-dom/server';

let win: Window;
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

describe('InstallRuntime SSR', () => {
  test('renders nothing on the server (returns null)', () => {
    const html = renderToString(<InstallRuntime />);
    expect(html).toBe('');
  });
});
