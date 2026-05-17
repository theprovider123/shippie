import { describe, expect, test } from 'bun:test';
import { deriveLeftover, describeEatBy } from './leftover-tracker.ts';

describe('deriveLeftover', () => {
  test('returns null when fed equals or exceeds scaled servings', () => {
    expect(
      deriveLeftover({
        recipeName: 'Chili',
        scaledServings: 4,
        cookedFor: 4,
        idSeed: 'Mon|Dinner|Chili',
      }),
    ).toBeNull();

    expect(
      deriveLeftover({
        recipeName: 'Chili',
        scaledServings: 4,
        cookedFor: 5,
        idSeed: 'Mon|Dinner|Chili',
      }),
    ).toBeNull();
  });

  test('emits surplus = scaled - cooked-for', () => {
    const cookedAt = new Date('2026-04-27T18:00:00Z');
    const out = deriveLeftover({
      recipeName: 'Chili',
      scaledServings: 6,
      cookedFor: 2,
      cookedAt,
      idSeed: 'Mon|Dinner|Chili',
    });
    expect(out).not.toBeNull();
    expect(out!.servings).toBe(4);
    expect(out!.recipeName).toBe('Chili');
  });

  test('eat-by is three days after cooked-at', () => {
    const cookedAt = new Date('2026-04-27T18:00:00Z');
    const out = deriveLeftover({
      recipeName: 'Soup',
      scaledServings: 4,
      cookedFor: 2,
      cookedAt,
      idSeed: 'x',
    });
    const eatBy = new Date(out!.eatBy);
    expect(eatBy.getTime() - cookedAt.getTime()).toBe(3 * 24 * 60 * 60 * 1000);
  });

  test('id is stable for the same seed + cookedAt', () => {
    const cookedAt = new Date('2026-04-27T18:00:00Z');
    const a = deriveLeftover({
      recipeName: 'Soup',
      scaledServings: 4,
      cookedFor: 2,
      cookedAt,
      idSeed: 'x',
    });
    const b = deriveLeftover({
      recipeName: 'Soup',
      scaledServings: 4,
      cookedFor: 2,
      cookedAt,
      idSeed: 'x',
    });
    expect(a!.id).toBe(b!.id);
  });
});

describe('describeEatBy', () => {
  test('says "eat today" when eatBy has already passed', () => {
    const now = new Date('2026-04-30T12:00:00Z');
    const eatBy = new Date('2026-04-29T12:00:00Z').toISOString();
    expect(describeEatBy(eatBy, now)).toBe('eat today');
  });

  test('says tomorrow when eatBy is one day out', () => {
    const now = new Date('2026-04-30T12:00:00Z');
    const eatBy = new Date('2026-05-01T12:00:00Z').toISOString();
    expect(describeEatBy(eatBy, now)).toBe('eat by tomorrow');
  });

  test('uses weekday name within the week', () => {
    const now = new Date('2026-04-27T12:00:00Z'); // Mon
    const eatBy = new Date('2026-04-30T12:00:00Z').toISOString(); // Thu
    expect(describeEatBy(eatBy, now)).toMatch(/^eat by \w+$/);
  });
});
