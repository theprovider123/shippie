import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('./DockRail.svelte', import.meta.url), 'utf8');
describe('DockRail (guardrail)', () => {
  test('every action has an accessible name + tooltip', () => {
    expect(src).toContain('aria-label');
    expect(src).toContain('title=');
  });
  test('no bare single-letter mystery-meat glyph (stray-M regression)', () => {
    expect(src).not.toMatch(/aria-label="Maker"[^>]*>\s*M\s*</);
    expect(src).toContain('<svg');
  });
  test('coarse-pointer fallback so it is not icon-only on tablets', () => {
    expect(src).toContain('(pointer: coarse)');
  });
  test('preserves mobile hide', () => {
    expect(src).toMatch(/max-width:\s*640px[\s\S]*display:\s*none/);
  });
});
