import { describe, expect, test } from 'bun:test';
import { pickDinner, type DinnerCandidate } from './dinner-picker.ts';
import type { DinnerEntry, FridgeItem } from '../sync/hearth-doc.ts';

const POOL: ReadonlyArray<DinnerCandidate> = [
  { label: 'Pasta night', keywords: ['pasta', 'leek'] },
  { label: 'Eggs on toast', keywords: ['eggs', 'bread'] },
  { label: 'Bare cupboard surprise', keywords: [] },
];

function fridge(items: Array<{ label: string }>): FridgeItem[] {
  return items.map((i, ix) => ({
    id: `f${ix}`,
    label: i.label,
    qty_text: '1',
    added_at: 0,
    added_by: 'm',
  }));
}

function history(items: Array<{ label: string; eaten_at: number }>): DinnerEntry[] {
  return items.map((i, ix) => ({
    id: `d${ix}`,
    label: i.label,
    eaten_at: i.eaten_at,
    who_cooked: null,
  }));
}

describe('dinner-picker', () => {
  test('prefers candidate whose keywords match fridge', () => {
    const out = pickDinner({
      fridge: fridge([{ label: 'half a leek' }, { label: 'pasta' }]),
      history: [],
      candidates: POOL,
      random: () => 0,
    });
    expect(out?.label).toBe('Pasta night');
    expect(out?.hint).toBe('we_have_it');
    expect(out?.matched).toContain('pasta');
    expect(out?.matched).toContain('leek');
  });

  test('avoids labels eaten in the recent window', () => {
    const now = 1_700_000_000_000;
    const out = pickDinner({
      fridge: fridge([{ label: 'pasta' }, { label: 'leek' }]),
      history: history([{ label: 'Pasta night', eaten_at: now - 86_400_000 }]),
      candidates: POOL,
      now,
      random: () => 0,
    });
    expect(out?.label).not.toBe('Pasta night');
  });

  test('falls back to a non-matching candidate when nothing matches', () => {
    const out = pickDinner({
      fridge: fridge([{ label: 'mystery item' }]),
      history: [],
      candidates: POOL,
      random: () => 0,
    });
    expect(out).not.toBeNull();
    expect(out?.hint).toBe('might_work');
  });

  test('returns null if every candidate is in recent history', () => {
    const now = 1_700_000_000_000;
    const out = pickDinner({
      fridge: fridge([{ label: 'pasta' }]),
      history: history(POOL.map((c) => ({ label: c.label, eaten_at: now - 1000 }))),
      candidates: POOL,
      now,
      random: () => 0,
    });
    expect(out).toBeNull();
  });

  test('does not suggest a meal eaten yesterday', () => {
    const now = 1_700_000_000_000;
    const yesterday = now - 86_400_000 - 60_000;
    const out = pickDinner({
      fridge: fridge([{ label: 'pasta' }, { label: 'leek' }]),
      history: history([{ label: 'Pasta night', eaten_at: yesterday }]),
      candidates: POOL,
      now,
      random: () => 0,
    });
    expect(out?.label).not.toBe('Pasta night');
  });
});
