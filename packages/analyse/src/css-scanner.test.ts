import { describe, expect, test } from 'bun:test';
import { scanCss } from './css-scanner.ts';

const enc = (s: string) => new TextEncoder().encode(s);

describe('scanCss', () => {
  test('picks the most common hex colour as primary', () => {
    const css = `
      .a { color: #E8603C; }
      .b { background: #E8603C; }
      .c { border: 1px solid #E8603C; }
      .d { color: #ffffff; }
    `;
    const r = scanCss(new Map([['style.css', enc(css)]]));
    expect(r.primaryColor?.toLowerCase()).toBe('#e8603c');
  });

  test('extracts body background from selector', () => {
    const css = `body { background: #FAF7EF; color: #14120F; }`;
    const r = scanCss(new Map([['style.css', enc(css)]]));
    expect(r.backgroundColor?.toLowerCase()).toBe('#faf7ef');
  });

  test('extracts first font-family non-system fallback', () => {
    const css = `body { font-family: 'Inter', -apple-system, sans-serif; }`;
    const r = scanCss(new Map([['style.css', enc(css)]]));
    expect(r.fontFamily).toBe('Inter');
  });

  test('counts @keyframes', () => {
    const css = `@keyframes a {} @keyframes b {} @-webkit-keyframes c {}`;
    const r = scanCss(new Map([['style.css', enc(css)]]));
    expect(r.hasCustomAnimations).toBe(true);
  });

  test('returns nulls when no css present', () => {
    const r = scanCss(new Map());
    expect(r.primaryColor).toBeNull();
    expect(r.backgroundColor).toBeNull();
    expect(r.fontFamily).toBeNull();
    expect(r.hasCustomAnimations).toBe(false);
  });
});
