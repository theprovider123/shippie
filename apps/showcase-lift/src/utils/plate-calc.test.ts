import { describe, expect, it } from 'bun:test';
import { DEFAULT_BAR_KG, DEFAULT_PLATES_KG, solvePlates } from './plate-calc.ts';

describe('solvePlates', () => {
  it('returns just the bar when target equals bar', () => {
    const r = solvePlates({ targetLoad: 20, barWeight: DEFAULT_BAR_KG, plates: DEFAULT_PLATES_KG });
    expect(r.achievedLoad).toBe(20);
    expect(r.plates).toEqual([]);
    expect(r.exact).toBe(true);
  });

  it('returns just the bar when target below bar', () => {
    const r = solvePlates({ targetLoad: 10, barWeight: 20, plates: DEFAULT_PLATES_KG });
    expect(r.achievedLoad).toBe(20);
    expect(r.exact).toBe(false);
  });

  it('solves the canonical 102.5kg case', () => {
    const r = solvePlates({ targetLoad: 102.5, barWeight: 20, plates: DEFAULT_PLATES_KG });
    expect(r.achievedLoad).toBe(102.5);
    expect(r.plates).toEqual([20, 15, 6.25].includes(6.25) ? r.plates : r.plates);
    expect(r.exact).toBe(true);
    // 20 + 2*(20+15+6.25) = 20 + 82.5 = 102.5; but 6.25 is not in defaults; greedy picks 20+15+5+2.5+1.25 = 43.75/side -> 20+87.5 = 107.5? Recheck.
    // Per-side need: (102.5-20)/2 = 41.25. Plates 25/20/15/10/5/2.5/1.25.
    // Greedy: 25 (16.25) -> 15 (1.25) -> 1.25 (0). Result: [25, 15, 1.25].
    expect(r.plates).toEqual([25, 15, 1.25]);
  });

  it('solves the simple 60kg case', () => {
    const r = solvePlates({ targetLoad: 60, barWeight: 20, plates: DEFAULT_PLATES_KG });
    // per-side 20: greedy = [20]
    expect(r.plates).toEqual([20]);
    expect(r.achievedLoad).toBe(60);
    expect(r.exact).toBe(true);
  });

  it('falls short when target unachievable', () => {
    // Per-side 0.5kg need; smallest plate is 1.25kg. Result: empty plates.
    const r = solvePlates({ targetLoad: 21, barWeight: 20, plates: DEFAULT_PLATES_KG });
    expect(r.plates).toEqual([]);
    expect(r.achievedLoad).toBe(20);
    expect(r.exact).toBe(false);
  });

  it('handles 100kg with standard plates', () => {
    const r = solvePlates({ targetLoad: 100, barWeight: 20, plates: DEFAULT_PLATES_KG });
    // per-side 40: greedy = 25 + 15 = 40
    expect(r.plates).toEqual([25, 15]);
    expect(r.achievedLoad).toBe(100);
  });
});
