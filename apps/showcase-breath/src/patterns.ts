/**
 * Breath patterns. Each pattern is a sequence of phases, looped for
 * `rounds` cycles. The visual ring scales by `expand` per phase: 1
 * grows (inhale), -1 shrinks (exhale), 0 holds.
 */

export type PatternId = 'box' | '4-7-8' | 'wim-hof';

export interface Phase {
  label: 'inhale' | 'hold' | 'exhale' | 'hold-empty';
  seconds: number;
  expand: -1 | 0 | 1;
}

export interface Pattern {
  id: PatternId;
  name: string;
  blurb: string;
  phases: ReadonlyArray<Phase>;
  defaultRounds: number;
}

export const PATTERNS: ReadonlyArray<Pattern> = [
  {
    id: 'box',
    name: 'Box',
    blurb: '4-4-4-4. Steady, even, easy. Good for any time.',
    phases: [
      { label: 'inhale', seconds: 4, expand: 1 },
      { label: 'hold', seconds: 4, expand: 0 },
      { label: 'exhale', seconds: 4, expand: -1 },
      { label: 'hold-empty', seconds: 4, expand: 0 },
    ],
    defaultRounds: 6,
  },
  {
    id: '4-7-8',
    name: '4-7-8',
    blurb: 'Inhale 4, hold 7, exhale 8. Slows the heart — best at night.',
    phases: [
      { label: 'inhale', seconds: 4, expand: 1 },
      { label: 'hold', seconds: 7, expand: 0 },
      { label: 'exhale', seconds: 8, expand: -1 },
    ],
    defaultRounds: 4,
  },
  {
    id: 'wim-hof',
    name: 'Wim Hof',
    blurb: '30 quick, full breaths, then hold on empty. Energising.',
    phases: [
      { label: 'inhale', seconds: 1, expand: 1 },
      { label: 'exhale', seconds: 1, expand: -1 },
    ],
    defaultRounds: 30,
  },
];

/** Total seconds for one round of the pattern. */
export function roundSeconds(p: Pattern): number {
  return p.phases.reduce((sum, ph) => sum + ph.seconds, 0);
}

/** Total seconds for `rounds` full cycles. */
export function totalSeconds(p: Pattern, rounds: number): number {
  return roundSeconds(p) * rounds;
}

/**
 * Compute the active phase index + remaining seconds in that phase,
 * given total elapsed seconds since session start.
 */
export function phaseAt(
  pattern: Pattern,
  elapsed: number,
): { roundIndex: number; phaseIndex: number; remainInPhase: number; phase: Phase } | null {
  const cycle = roundSeconds(pattern);
  if (cycle === 0) return null;
  const roundIndex = Math.floor(elapsed / cycle);
  let local = elapsed - roundIndex * cycle;
  for (let i = 0; i < pattern.phases.length; i++) {
    const phase = pattern.phases[i]!;
    if (local < phase.seconds) {
      return {
        roundIndex,
        phaseIndex: i,
        remainInPhase: phase.seconds - local,
        phase,
      };
    }
    local -= phase.seconds;
  }
  return null;
}
