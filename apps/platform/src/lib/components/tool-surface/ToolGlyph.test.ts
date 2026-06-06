import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./ToolGlyph.svelte', import.meta.url), 'utf8');

describe('ToolGlyph structure (guardrail)', () => {
  test('uses the shared algorithm from the package root', () => {
    expect(src).toContain("from '@shippie/design-tokens/tool-icon'");
    // Order-independent: both symbols must be imported, regardless of sort order.
    expect(src).toMatch(/\bmonogram\b/);
    expect(src).toMatch(/\baccentColor\b/);
  });
  test('render priority is iconUrl → glyph → monogram', () => {
    const iImg = src.indexOf('iconUrl}');
    const iGlyph = src.indexOf(':else if glyph');
    const iMono = src.indexOf('class="monogram"');
    expect(iImg).toBeGreaterThan(-1);
    expect(iGlyph).toBeGreaterThan(iImg);
    expect(iMono).toBeGreaterThan(iGlyph);
  });
  test('rocket badge is gated on running + a size threshold', () => {
    expect(src).toContain('showRocket');
    expect(src).toMatch(/running\s*&&\s*size\s*>=\s*28/);
    expect(src).toContain('class="rocket"');
  });
  test('uses the brand mono font and hybrid-radius token', () => {
    expect(src).toContain("--font-mono");
    expect(src).toContain('var(--tool-icon-radius)');
  });
  test('respects prefers-reduced-motion for the pulse', () => {
    expect(src).toContain('prefers-reduced-motion');
  });
});
