import { describe, expect, it } from 'bun:test';
import { detectPrCandidates, repRange, beats } from './pr-detect.ts';
import type { SetRow } from '../db/schema.ts';

function set(input: Partial<SetRow> & { id: string; weight: number; reps: number }): SetRow {
  return {
    id: input.id,
    step_id: input.step_id ?? 'step_a',
    set_index: input.set_index ?? 0,
    weight: input.weight,
    reps: input.reps,
    unit: input.unit ?? 'kg',
    set_type: input.set_type ?? 'working',
    rpe: null,
    rir: null,
    bar_weight: null,
    plate_inventory_id: null,
    completed_at: input.completed_at ?? '2026-05-01T10:00:00.000Z',
    source: 'manual',
  };
}

describe('repRange', () => {
  it('buckets reps into the right ranges', () => {
    expect(repRange(1)).toBe('1-3');
    expect(repRange(3)).toBe('1-3');
    expect(repRange(4)).toBe('4-6');
    expect(repRange(6)).toBe('4-6');
    expect(repRange(7)).toBe('7-10');
    expect(repRange(10)).toBe('7-10');
    expect(repRange(11)).toBe('11-15');
    expect(repRange(15)).toBe('11-15');
    expect(repRange(16)).toBe('16+');
    expect(repRange(20)).toBe('16+');
  });
});

describe('beats', () => {
  it('says yes when weight increases', () => {
    expect(beats(set({ id: 'a', weight: 100, reps: 5 }), set({ id: 'b', weight: 95, reps: 5 }))).toBe(true);
  });
  it('says yes when same weight more reps', () => {
    expect(beats(set({ id: 'a', weight: 100, reps: 6 }), set({ id: 'b', weight: 100, reps: 5 }))).toBe(true);
  });
  it('says no when weight drops', () => {
    expect(beats(set({ id: 'a', weight: 90, reps: 5 }), set({ id: 'b', weight: 100, reps: 5 }))).toBe(false);
  });
  it('says no when ties exactly', () => {
    expect(beats(set({ id: 'a', weight: 100, reps: 5 }), set({ id: 'b', weight: 100, reps: 5 }))).toBe(false);
  });
});

describe('detectPrCandidates', () => {
  it('returns variant + lineage + rep-range PRs on a fresh max', () => {
    const candidate = set({ id: 'new', weight: 100, reps: 5 });
    const history = [set({ id: 'old', weight: 95, reps: 5 })];
    const out = detectPrCandidates({
      set: candidate,
      variantId: 'va_bench_bb',
      lineageId: 'ln_bench',
      variantHistory: history,
      lineageHistory: history,
    });
    const kinds = out.map((c) => c.pr.kind).sort();
    expect(kinds).toEqual(['lineage', 'rep-range', 'variant']);
    expect(out[0]?.previousBest?.weight).toBe(95);
  });

  it('returns no PRs for warmup sets', () => {
    const candidate = set({ id: 'new', weight: 100, reps: 5, set_type: 'warmup' });
    const out = detectPrCandidates({
      set: candidate,
      variantId: 'va_bench_bb',
      lineageId: 'ln_bench',
      variantHistory: [],
      lineageHistory: [],
    });
    expect(out).toEqual([]);
  });

  it('returns rep-range PR even when variant PR doesnt fire', () => {
    // History has a 100×3 (rep-range 1-3 best). New set is 95×8 — lower
    // weight, but in a different rep-range bucket where there's nothing
    // yet. Variant PR comparison goes by weight first, so 95×8 doesn't
    // beat 100×3 absolutely. But the 7-10 rep-range bucket is empty.
    const oldHeavy = set({ id: 'old1', weight: 100, reps: 3 });
    const candidate = set({ id: 'new', weight: 95, reps: 8 });
    const out = detectPrCandidates({
      set: candidate,
      variantId: 'va_bench_bb',
      lineageId: 'ln_bench',
      variantHistory: [oldHeavy],
      lineageHistory: [oldHeavy],
    });
    const kinds = out.map((c) => c.pr.kind);
    expect(kinds).toContain('rep-range');
    expect(kinds).not.toContain('variant');
    expect(kinds).not.toContain('lineage');
  });

  it('returns nothing on an exact tie', () => {
    const old = set({ id: 'old', weight: 100, reps: 5 });
    const candidate = set({ id: 'new', weight: 100, reps: 5 });
    const out = detectPrCandidates({
      set: candidate,
      variantId: 'va_bench_bb',
      lineageId: 'ln_bench',
      variantHistory: [old],
      lineageHistory: [old],
    });
    expect(out).toEqual([]);
  });

  it('first-ever working set is a PR across all three kinds', () => {
    const candidate = set({ id: 'new', weight: 60, reps: 5 });
    const out = detectPrCandidates({
      set: candidate,
      variantId: 'va_bench_bb',
      lineageId: 'ln_bench',
      variantHistory: [],
      lineageHistory: [],
    });
    expect(out).toHaveLength(3);
    expect(out.every((c) => c.previousBest === null)).toBe(true);
  });

  it('lineage PR fires when a sibling variant has a higher number but candidate beats overall', () => {
    // A previous dumbbell-bench session of 90kg × 5; new barbell-bench of
    // 100kg × 5. Lineage history (any variant) should include both. The
    // dumbbell wasn't a barbell PR, but the new set IS a lineage PR.
    const dumbbellOld = set({ id: 'db_old', weight: 90, reps: 5 });
    const candidate = set({ id: 'bb_new', weight: 100, reps: 5 });
    const out = detectPrCandidates({
      set: candidate,
      variantId: 'va_bench_bb',
      lineageId: 'ln_bench',
      variantHistory: [], // no prior barbell-bench
      lineageHistory: [dumbbellOld],
    });
    const kinds = out.map((c) => c.pr.kind).sort();
    expect(kinds).toEqual(['lineage', 'rep-range', 'variant']);
  });
});
