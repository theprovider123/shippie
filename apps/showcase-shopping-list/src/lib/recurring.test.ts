import { describe, expect, test } from 'bun:test';
import {
  addSpec,
  makeSpec,
  markBought,
  nextDueLabel,
  pauseSpec,
  removeSpec,
  setCadence,
  tickRecurring,
} from './recurring.ts';
import type { ListItem } from './types.ts';

const NOW = Date.parse('2026-05-05T09:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('recurring', () => {
  test('makeSpec normalises cadence and sets defaults', () => {
    const spec = makeSpec({ name: 'milk', cadenceDays: 0, now: NOW });
    expect(spec.cadenceDays).toBe(1);
    expect(spec.lastBoughtAt).toBeNull();
    expect(spec.lastQueuedAt).toBeNull();
  });

  test('tickRecurring queues new items when no history', () => {
    const milk = makeSpec({ name: 'milk', cadenceDays: 5, now: NOW });
    const result = tickRecurring({ specs: [milk], items: [], now: NOW });
    expect(result.toQueue).toHaveLength(1);
    expect(result.toQueue[0]?.name).toBe('milk');
    expect(result.toQueue[0]?.source).toBe('recurring');
    expect(result.updatedSpecs[0]?.lastQueuedAt).not.toBeNull();
  });

  test('tickRecurring skips when item already on the live list', () => {
    const milk = makeSpec({ name: 'milk', cadenceDays: 5, now: NOW });
    const live: ListItem[] = [
      { id: 'x', name: 'Milk', checked: false, source: 'manual', addedAt: new Date(NOW).toISOString() },
    ];
    const result = tickRecurring({ specs: [milk], items: live, now: NOW });
    expect(result.toQueue).toHaveLength(0);
  });

  test('tickRecurring respects cadence', () => {
    const milk = {
      ...makeSpec({ name: 'milk', cadenceDays: 5, now: NOW }),
      lastBoughtAt: new Date(NOW - 2 * DAY_MS).toISOString(),
    };
    const result = tickRecurring({ specs: [milk], items: [], now: NOW });
    expect(result.toQueue).toHaveLength(0);

    const due = {
      ...makeSpec({ name: 'eggs', cadenceDays: 5, now: NOW }),
      lastBoughtAt: new Date(NOW - 6 * DAY_MS).toISOString(),
    };
    const result2 = tickRecurring({ specs: [due], items: [], now: NOW });
    expect(result2.toQueue).toHaveLength(1);
  });

  test('paused specs never queue', () => {
    const milk = { ...makeSpec({ name: 'milk', cadenceDays: 5, now: NOW }), paused: true };
    const result = tickRecurring({ specs: [milk], items: [], now: NOW });
    expect(result.toQueue).toHaveLength(0);
  });

  test('markBought matches by id and by name', () => {
    const milk = makeSpec({ name: 'milk', cadenceDays: 5, now: NOW });
    const byId = markBought([milk], { recurringSpecId: milk.id, name: 'milk' }, NOW);
    expect(byId[0]?.lastBoughtAt).not.toBeNull();
    const byName = markBought([milk], { name: 'MILK' } as Pick<ListItem, 'recurringSpecId' | 'name'>, NOW);
    expect(byName[0]?.lastBoughtAt).not.toBeNull();
  });

  test('addSpec dedupes by name', () => {
    const a = makeSpec({ name: 'milk', now: NOW });
    const b = makeSpec({ name: 'Milk', id: 'b', now: NOW });
    const out = addSpec([a], b);
    expect(out).toHaveLength(1);
  });

  test('pauseSpec / setCadence / removeSpec are pure', () => {
    const milk = makeSpec({ name: 'milk', cadenceDays: 5, now: NOW });
    expect(pauseSpec([milk], milk.id, true)[0]?.paused).toBe(true);
    expect(pauseSpec([milk], milk.id, true)[0]).not.toBe(milk);
    expect(setCadence([milk], milk.id, 14)[0]?.cadenceDays).toBe(14);
    expect(removeSpec([milk], milk.id)).toHaveLength(0);
  });

  test('nextDueLabel words "due now" / "due in N days" / "paused"', () => {
    const milk = makeSpec({ name: 'milk', cadenceDays: 5, now: NOW });
    expect(nextDueLabel(milk, NOW)).toBe('due now');
    expect(nextDueLabel({ ...milk, paused: true }, NOW)).toBe('paused');
    expect(
      nextDueLabel(
        { ...milk, lastBoughtAt: new Date(NOW - 2 * DAY_MS).toISOString() },
        NOW,
      ),
    ).toBe('due in 3 days');
  });
});
