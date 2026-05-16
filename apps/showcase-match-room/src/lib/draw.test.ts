import { describe, expect, test } from 'bun:test';
import { TEAMS } from '../data/tournament.ts';
import { createSweepstakeDraw, seededShuffle } from './draw.ts';

describe('sweepstake draw', () => {
  test('shuffles deterministically and assigns all 48 teams', () => {
    expect(seededShuffle(['A', 'B', 'C'], 'pub')).toEqual(seededShuffle(['A', 'B', 'C'], 'pub'));
    const draw = createSweepstakeDraw(['Amina', 'Leo', 'Sofia'], 'azteca-opening');
    const assigned = draw.flatMap((item) => item.teams);
    expect(new Set(assigned).size).toBe(TEAMS.length);
    expect(assigned.length).toBe(48);
  });
});
