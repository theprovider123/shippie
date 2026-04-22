// apps/web/app/components/theme-color.test.tsx
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { renderToString } from 'react-dom/server';
import { ThemeColor } from './theme-color.tsx';

let win: Window;
const originalDocument = (globalThis as { document?: unknown }).document;
const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  win = new Window({ url: 'https://shippie.app/' });
  // @ts-expect-error test
  globalThis.document = win.document;
  // @ts-expect-error test
  globalThis.window = win;
});

afterAll(() => {
  (globalThis as { document?: unknown }).document = originalDocument;
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe('ThemeColor SSR', () => {
  test('renders nothing on the server', () => {
    expect(renderToString(<ThemeColor color="#112233" />)).toBe('');
  });
});
