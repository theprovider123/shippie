import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  CANONICAL_TOKENS,
  CANONICAL_TAILWIND_MAPPINGS,
  TOKENS_CSS_PATH,
  TAILWIND_THEME_CSS_PATH,
  CHECKLIST_PATH,
} from './index';

describe('@shippie/design-tokens', () => {
  test('tokens.css contains every canonical CSS variable', () => {
    const css = readFileSync(TOKENS_CSS_PATH, 'utf8');
    for (const token of CANONICAL_TOKENS) {
      expect(css).toContain(`${token}:`);
    }
  });

  test('tokens.css declares both dark and cream inversions', () => {
    const css = readFileSync(TOKENS_CSS_PATH, 'utf8');
    expect(css).toContain(':root {');
    expect(css).toContain('[data-theme="light"]');
    expect(css).toContain('color-scheme: dark');
    expect(css).toContain('color-scheme: light');
  });

  test('tokens.css ships the .eyebrow primitive + .shippie-icon', () => {
    const css = readFileSync(TOKENS_CSS_PATH, 'utf8');
    expect(css).toContain('.eyebrow');
    expect(css).toContain('.shippie-icon');
    expect(css).toContain('border-radius: 0');
  });

  test('tailwind-theme.css declares @theme with the canonical mappings', () => {
    const css = readFileSync(TAILWIND_THEME_CSS_PATH, 'utf8');
    expect(css).toContain('@theme inline');
    for (const mapping of CANONICAL_TAILWIND_MAPPINGS) {
      expect(css).toContain(`${mapping}:`);
    }
  });

  test('tailwind-theme.css overrides Tailwind radius defaults to 0', () => {
    const css = readFileSync(TAILWIND_THEME_CSS_PATH, 'utf8');
    expect(css).toMatch(/--radius-md:\s*0/);
    expect(css).toMatch(/--radius-lg:\s*0/);
    expect(css).toMatch(/--radius-2xl:\s*0/);
  });

  test('checklist.md ships the 10-item rubric', () => {
    const md = readFileSync(CHECKLIST_PATH, 'utf8');
    // Cheap structural check — 10 numbered items.
    expect(md).toContain('# Shippie-Native Checklist');
    for (let i = 1; i <= 10; i++) {
      expect(md).toContain(`${i}. **`);
    }
  });
});
