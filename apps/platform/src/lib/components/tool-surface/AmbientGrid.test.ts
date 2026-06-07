import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./AmbientGrid.svelte', import.meta.url), 'utf8');

describe('AmbientGrid (guardrail)', () => {
  test('creates exactly one GL context (never per-tile)', () => {
    expect(src.match(/getContext\(/g)?.length).toBe(1);
  });
  test('honors prefers-reduced-motion and has a static fallback', () => {
    expect(src).toContain('prefers-reduced-motion');
    expect(src).toContain('ambient-static');
  });
  test('pauses animation when the tab is hidden', () => {
    expect(src).toContain('document.hidden');
  });
});
