import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { setThemeColor } from './theme-color.ts';

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

describe('setThemeColor', () => {
  test('creates a theme-color meta tag if none exists', () => {
    setThemeColor('#123456');
    const meta = win.document.querySelector('meta[name="theme-color"]');
    expect(meta?.getAttribute('content')).toBe('#123456');
  });

  test('updates existing theme-color meta tag in place', () => {
    setThemeColor('#111111');
    setThemeColor('#222222');
    const tags = win.document.querySelectorAll('meta[name="theme-color"]');
    expect(tags.length).toBe(1);
    expect(tags[0]?.getAttribute('content')).toBe('#222222');
  });
});
