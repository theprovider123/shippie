import { describe, expect, it } from 'bun:test';
import { recommendProgression } from './progression.ts';

const base = { targetReps: 5, targetSets: 3, increment: 2.5 };

describe('recommendProgression', () => {
  it('holds with no history', () => {
    const r = recommendProgression({ ...base, lastSessionSets: [] });
    expect(r.action).toBe('hold');
    expect(r.nextWeight).toBe(0);
  });

  it('advances when every target rep was hit', () => {
    const r = recommendProgression({
      ...base,
      lastSessionSets: [
        { weight: 100, reps: 5 },
        { weight: 100, reps: 5 },
        { weight: 100, reps: 5 },
      ],
    });
    expect(r.action).toBe('advance');
    expect(r.nextWeight).toBe(102.5);
  });

  it('holds when the weight was hit but reps fell short', () => {
    const r = recommendProgression({
      ...base,
      lastSessionSets: [
        { weight: 100, reps: 5 },
        { weight: 100, reps: 5 },
        { weight: 100, reps: 3 },
      ],
    });
    expect(r.action).toBe('hold');
    expect(r.nextWeight).toBe(100);
  });

  it('holds when too few sets reached the working weight', () => {
    const r = recommendProgression({
      ...base,
      lastSessionSets: [
        { weight: 100, reps: 5 },
        { weight: 100, reps: 5 },
      ],
    });
    expect(r.action).toBe('hold');
  });

  it('deloads after the stall threshold', () => {
    const r = recommendProgression({
      ...base,
      lastSessionSets: [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }, { weight: 100, reps: 5 }],
      consecutiveStalls: 3,
    });
    expect(r.action).toBe('deload');
    expect(r.nextWeight).toBe(90); // 100*0.9 rounded to 2.5
  });

  it('repeats after a long layoff instead of advancing', () => {
    const r = recommendProgression({
      ...base,
      lastSessionSets: [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }, { weight: 100, reps: 5 }],
      daysSinceLast: 21,
    });
    expect(r.action).toBe('repeat');
    expect(r.nextWeight).toBe(100);
  });

  it('rounds advances to the available increment', () => {
    const r = recommendProgression({
      targetReps: 5,
      targetSets: 1,
      increment: 5,
      lastSessionSets: [{ weight: 101, reps: 5 }],
    });
    // 101 + 5 = 106 → nearest 5 = 105
    expect(r.nextWeight).toBe(105);
  });
});
