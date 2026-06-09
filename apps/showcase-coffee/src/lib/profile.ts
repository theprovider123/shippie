// Taste-profile derivation.
//
// Aggregates published cup scores into a five-axis palate, weighting recent
// cups more heavily (palates drift; the last month says more than last year).
// Cup scores are stored 1–10 per axis; the radar renders on a 0–5 scale, so
// the derived profile is returned in 0–5 space to feed <RadarChart /> directly.

import { CUP_AXES, type CupAxis, type CupScore } from '../types.ts';

export interface Palate {
  /** 0–5 per axis, in CUP_AXES order. */
  scores: number[];
  labels: string[];
  axes: Record<CupAxis, number>;
  /** Number of cups that fed the profile. */
  sampleCount: number;
  /** Plain-English read, e.g. "bright and clean, light in body". */
  tendency: string;
}

const LABELS: Record<CupAxis, string> = {
  brightness: 'Brightness',
  body: 'Body',
  sweetness: 'Sweetness',
  complexity: 'Complexity',
  clean: 'Clean',
};

/** Half-life in cups: a cup N positions back from newest counts ~2^(-N/H). */
const HALF_LIFE = 6;

function weightFor(indexFromNewest: number): number {
  return Math.pow(2, -indexFromNewest / HALF_LIFE);
}

/**
 * @param scores cup scores; need not be pre-sorted. Newest (by createdAt) get
 *   the most weight.
 */
export function derivePalate(scores: readonly CupScore[]): Palate {
  const labels = CUP_AXES.map((a) => LABELS[a]);
  if (scores.length === 0) {
    return {
      scores: CUP_AXES.map(() => 0),
      labels,
      axes: emptyAxes(),
      sampleCount: 0,
      tendency: 'No cups scored yet — log a few and your palate takes shape.',
    };
  }

  const sorted = [...scores].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const axes = emptyAxes();
  let weightSum = 0;
  sorted.forEach((cup, i) => {
    const w = weightFor(i);
    weightSum += w;
    for (const axis of CUP_AXES) {
      // 1–10 → 0–5
      axes[axis] += (cup[axis] / 2) * w;
    }
  });
  for (const axis of CUP_AXES) {
    axes[axis] = weightSum > 0 ? round1(axes[axis] / weightSum) : 0;
  }

  return {
    scores: CUP_AXES.map((a) => axes[a]),
    labels,
    axes,
    sampleCount: scores.length,
    tendency: describe(axes),
  };
}

function emptyAxes(): Record<CupAxis, number> {
  return { brightness: 0, body: 0, sweetness: 0, complexity: 0, clean: 0 };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Turn the axis profile into a one-line plain-English tendency. */
function describe(axes: Record<CupAxis, number>): string {
  const ranked = CUP_AXES.map((a) => ({ a, v: axes[a] })).sort((x, y) => y.v - x.v);
  const top = ranked.slice(0, 2).map((r) => PHRASE_HIGH[r.a]);
  // CUP_AXES is non-empty, so ranked always has a last element.
  const low = ranked[ranked.length - 1] as { a: CupAxis; v: number };
  const lead = top.join(' and ');
  const tail = low.v <= 2.5 ? `, ${PHRASE_LOW[low.a]}` : '';
  const head = lead.charAt(0).toUpperCase() + lead.slice(1);
  return `${head}${tail}.`;
}

const PHRASE_HIGH: Record<CupAxis, string> = {
  brightness: 'bright and lively',
  body: 'full-bodied',
  sweetness: 'sweet-leaning',
  complexity: 'complex and layered',
  clean: 'clean and clear',
};

const PHRASE_LOW: Record<CupAxis, string> = {
  brightness: 'soft on acidity',
  body: 'light in body',
  sweetness: 'restrained in sweetness',
  complexity: 'straightforward',
  clean: 'with a little funk',
};
