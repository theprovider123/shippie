/**
 * Sex dice — three dice rolled together. Both phones see the same roll.
 *
 * Y.Map shape:
 *   current: { location, position, extra, rolledAt, rolledBy } | null
 *   history: array (last 30)
 */
import * as Y from 'yjs';

export const LOCATIONS = [
  'bed',
  'shower',
  'sofa',
  'kitchen',
  'floor',
  'wherever you are',
  'against a wall',
  'a chair',
] as const;

export const POSITIONS = [
  'on top',
  'underneath',
  'side by side',
  'behind',
  'in their lap',
  'facing each other',
  'one of you standing',
  'mirror in view',
] as const;

export const EXTRAS = [
  'no hands for one minute',
  'eye contact only',
  'whisper everything',
  'blindfold one of you',
  'slow as you can',
  'no clothes from the start',
  'pause halfway, breathe',
  'one new thing tonight',
] as const;

export interface DiceRoll {
  location: string;
  position: string;
  extra: string;
  rolledAt: string;
  rolledBy: string;
}

function getMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('dice');
}

export function readDice(doc: Y.Doc): { current: DiceRoll | null; history: DiceRoll[] } {
  const m = getMap(doc);
  return {
    current: (m.get('current') as DiceRoll | null | undefined) ?? null,
    history: (m.get('history') as DiceRoll[] | undefined) ?? [],
  };
}

function pick<T>(arr: ReadonlyArray<T>): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function rollDice(doc: Y.Doc, rolledBy: string): DiceRoll {
  const roll: DiceRoll = {
    location: pick(LOCATIONS),
    position: pick(POSITIONS),
    extra: pick(EXTRAS),
    rolledAt: new Date().toISOString(),
    rolledBy,
  };
  const m = getMap(doc);
  const history = ((m.get('history') as DiceRoll[] | undefined) ?? []).slice(-29);
  m.set('current', roll);
  m.set('history', [...history, roll]);
  return roll;
}

export function clearDice(doc: Y.Doc): void {
  getMap(doc).set('current', null);
}
