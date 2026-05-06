import type { BrewMethod, Process, RoastLevel } from '../db.ts';

export const METHODS: ReadonlyArray<BrewMethod> = [
  'v60',
  'aeropress',
  'chemex',
  'french-press',
  'espresso',
];

export const ROAST_LEVELS: ReadonlyArray<RoastLevel> = ['light', 'medium', 'dark'];

export const PROCESSES: ReadonlyArray<Process> = ['washed', 'natural', 'honey', 'other'];

/** Suggested chips for the tasting-notes free-text. Tap to append. */
export const TASTING_CHIPS: ReadonlyArray<string> = [
  'chocolate',
  'berry',
  'citrus',
  'nutty',
  'floral',
  'caramel',
  'stone fruit',
  'spice',
  'tea-like',
];
