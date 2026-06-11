import { describe, test, expect } from 'bun:test';
import { parseDayText, type ParsedItem } from './parser';

const TRANSCRIPT =
  'took my meds with breakfast… slept about six and a half hours. walked over to the studio. two glasses of water so far. feeling… somewhere in the middle today.';

describe('parser — canonical transcript', () => {
  test('produces 5 items with correct kinds', () => {
    const items = parseDayText(TRANSCRIPT);
    expect(items).toHaveLength(5);

    const kinds = items.map((i) => i.kind);
    expect(kinds).toContain('medication');
    expect(kinds).toContain('sleep');
    expect(kinds).toContain('movement');
    expect(kinds).toContain('water');
    expect(kinds).toContain('mood');
  });

  test('medication: action is done', () => {
    const items = parseDayText(TRANSCRIPT);
    const med = items.find((i) => i.kind === 'medication') as Extract<ParsedItem, { kind: 'medication' }>;
    expect(med).toBeDefined();
    expect(med.action).toBe('done');
  });

  test('sleep: detail is 6.5h', () => {
    const items = parseDayText(TRANSCRIPT);
    const sleep = items.find((i) => i.kind === 'sleep') as Extract<ParsedItem, { kind: 'sleep' }>;
    expect(sleep).toBeDefined();
    expect(sleep.detail).toBe('6.5h');
    expect(sleep.action).toBe('done');
  });

  test('movement: action is done', () => {
    const items = parseDayText(TRANSCRIPT);
    const move = items.find((i) => i.kind === 'movement') as Extract<ParsedItem, { kind: 'movement' }>;
    expect(move).toBeDefined();
    expect(move.action).toBe('done');
  });

  test('water: count is 2', () => {
    const items = parseDayText(TRANSCRIPT);
    const water = items.find((i) => i.kind === 'water') as Extract<ParsedItem, { kind: 'water' }>;
    expect(water).toBeDefined();
    expect(water.count).toBe(2);
    expect(water.action).toBe('done');
  });

  test('mood: is okay', () => {
    const items = parseDayText(TRANSCRIPT);
    const mood = items.find((i) => i.kind === 'mood') as Extract<ParsedItem, { kind: 'mood' }>;
    expect(mood).toBeDefined();
    expect(mood.mood).toBe('okay');
    expect(mood.phrase).toMatch(/somewhere in the middle/i);
  });
});

describe('parser — skipped medication', () => {
  test('skipped meds → action skipped', () => {
    const items = parseDayText('skipped my meds this morning, feeling a bit off.');
    const med = items.find((i) => i.kind === 'medication') as Extract<ParsedItem, { kind: 'medication' }>;
    expect(med).toBeDefined();
    expect(med.action).toBe('skipped');
  });
});

describe('parser — garbage text', () => {
  test('returns empty array for unrecognised text', () => {
    const items = parseDayText('The quick brown fox jumps over the lazy dog');
    expect(items).toHaveLength(0);
  });

  test('returns empty array for empty string', () => {
    expect(parseDayText('')).toHaveLength(0);
  });
});

describe('parser — mood variants', () => {
  test('"rough" → heavy', () => {
    const items = parseDayText('Today was pretty rough honestly.');
    const mood = items.find((i) => i.kind === 'mood') as Extract<ParsedItem, { kind: 'mood' }>;
    expect(mood?.mood).toBe('heavy');
  });

  test('"great" → bright', () => {
    const items = parseDayText('Feeling great today!');
    const mood = items.find((i) => i.kind === 'mood') as Extract<ParsedItem, { kind: 'mood' }>;
    expect(mood?.mood).toBe('bright');
  });

  test('"flat" → low', () => {
    const items = parseDayText('Kind of flat today, nothing much happened.');
    const mood = items.find((i) => i.kind === 'mood') as Extract<ParsedItem, { kind: 'mood' }>;
    expect(mood?.mood).toBe('low');
  });
});

describe('parser — sleep variants', () => {
  test('"seven hours" → 7h', () => {
    const items = parseDayText('Slept seven hours last night.');
    const sleep = items.find((i) => i.kind === 'sleep') as Extract<ParsedItem, { kind: 'sleep' }>;
    expect(sleep?.detail).toBe('7h');
  });
});
