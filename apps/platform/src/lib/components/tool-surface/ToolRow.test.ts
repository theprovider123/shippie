import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./ToolRow.svelte', import.meta.url), 'utf8');

describe('ToolRow tile variant (guardrail)', () => {
  test('declares a closed variant union', () => {
    expect(src).toContain("variant?: 'row' | 'tile'");
  });
  test('tile branch renders ToolGlyph with running state', () => {
    expect(src).toContain('ToolGlyph');
    expect(src).toMatch(/running=\{state\.relationship === 'running'\}/);
    expect(src).toContain("variant === 'tile'");
  });
});
