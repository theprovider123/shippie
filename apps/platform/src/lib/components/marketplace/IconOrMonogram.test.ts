import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./IconOrMonogram.svelte', import.meta.url), 'utf8');

describe('IconOrMonogram delegates to ToolGlyph (guardrail)', () => {
  test('imports and renders ToolGlyph', () => {
    expect(src).toContain('ToolGlyph');
    expect(src).toMatch(/<ToolGlyph[\s\S]*\/>/);
  });
  test('no longer contains its own monogram/letter logic', () => {
    expect(src).not.toContain('.monogram');
    expect(src).not.toMatch(/name\?\.trim\(\)\?\.\[0\]/);
  });
  test('forwards the identifying props', () => {
    for (const p of ['name', 'slug', 'iconUrl', 'themeColor', 'size']) {
      expect(src).toContain(p);
    }
  });
});
