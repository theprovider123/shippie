import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Guardrail (spec §10.1): the two primitives must source their
 * relationship / update / save copy from ./labels and carry none of the
 * drift phrases inline. The single-word labels (Saved / Update / Review)
 * appear validly elsewhere (e.g. a "Saved offline" dot title), so this
 * checks (a) the label functions are imported, and (b) the unambiguous
 * multi-word relationship phrases never appear as inline literals.
 *
 * The §10.2 bespoke-markup ban (rail-item / tool-row / …) lands in
 * Sprint 4, once those classes are migrated off the legacy surfaces.
 */

const here = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

const ROW = here('./ToolRow.svelte');
const CARD = here('./ToolCard.svelte');

const DRIFT_PHRASES = ['Open now', 'Running now', 'Saved to Dock'];

describe('ToolRow — label source guardrail', () => {
  test('imports relationship/update/save labels from ./labels', () => {
    expect(ROW).toMatch(/import\s*\{[^}]*relationshipLabel[^}]*\}\s*from\s*'\.\/labels'/s);
    expect(ROW).toMatch(/updateChipLabel/);
    expect(ROW).toMatch(/saveActionLabel/);
  });

  test('contains no inline relationship drift phrases', () => {
    for (const phrase of DRIFT_PHRASES) {
      expect(ROW.includes(phrase)).toBe(false);
    }
  });
});

describe('ToolCard — label source guardrail', () => {
  test('imports its save label from ./labels (browse cards show no relationship/update copy)', () => {
    expect(CARD).toMatch(/import\s*\{[^}]*saveActionLabel[^}]*\}\s*from\s*'\.\/labels'/s);
  });

  test('contains no inline relationship drift phrases', () => {
    for (const phrase of DRIFT_PHRASES) {
      expect(CARD.includes(phrase)).toBe(false);
    }
  });
});
