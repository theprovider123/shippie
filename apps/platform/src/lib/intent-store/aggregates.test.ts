import { describe, expect, test } from 'vitest';
import { summarise, labelFor, INTENT_LABELS } from './aggregates';
import type { IntentEvent } from './store';

function ev(appId: string, intent: string, ts: number, row: unknown = {}): IntentEvent {
  return { appId, intent, ts, row };
}

describe('summarise', () => {
  test('empty events → empty summary', () => {
    const s = summarise([], 86_400_000);
    expect(s.total).toBe(0);
    expect(s.apps).toEqual([]);
    expect(s.earliest).toBe(null);
    expect(s.latest).toBe(null);
  });

  test('single event → single-app summary', () => {
    const s = summarise([ev('field-kitchen', 'coffee-brewed', 1000)], 86_400_000);
    expect(s.total).toBe(1);
    expect(s.apps).toHaveLength(1);
    expect(s.apps[0]!.appId).toBe('field-kitchen');
    expect(s.apps[0]!.intents).toEqual([
      { intent: 'coffee-brewed', count: 1, latestRow: {}, latestTs: 1000 },
    ]);
  });

  test('aggregates per-intent counts within an app', () => {
    const events = [
      ev('field-kitchen', 'coffee-brewed', 1000),
      ev('field-kitchen', 'coffee-brewed', 2000),
      ev('field-kitchen', 'hydration-logged', 1500),
    ];
    const s = summarise(events, 86_400_000);
    expect(s.apps[0]!.count).toBe(3);
    const coffee = s.apps[0]!.intents.find((i) => i.intent === 'coffee-brewed')!;
    expect(coffee.count).toBe(2);
    expect(coffee.latestTs).toBe(2000);
    const hydrate = s.apps[0]!.intents.find((i) => i.intent === 'hydration-logged')!;
    expect(hydrate.count).toBe(1);
  });

  test('orders apps by most-recent-first', () => {
    const events = [
      ev('cycle', 'cycle-logged', 1000),
      ev('field-kitchen', 'coffee-brewed', 5000),
      ev('move', 'workout-completed', 3000),
    ];
    const s = summarise(events, 86_400_000);
    expect(s.apps.map((a) => a.appId)).toEqual(['field-kitchen', 'move', 'cycle']);
  });

  test('orders intents within an app by count', () => {
    const events = [
      ev('field-kitchen', 'coffee-brewed', 1000),
      ev('field-kitchen', 'coffee-brewed', 1100),
      ev('field-kitchen', 'coffee-brewed', 1200),
      ev('field-kitchen', 'hydration-logged', 1150),
    ];
    const s = summarise(events, 86_400_000);
    expect(s.apps[0]!.intents.map((i) => i.intent)).toEqual(['coffee-brewed', 'hydration-logged']);
  });

  test('captures earliest + latest timestamps', () => {
    const events = [
      ev('a', 'x', 1000),
      ev('b', 'y', 5000),
      ev('a', 'x', 3000),
    ];
    const s = summarise(events, 86_400_000);
    expect(s.earliest).toBe(1000);
    expect(s.latest).toBe(5000);
  });
});

describe('labelFor', () => {
  test('returns the friendly label for known intents', () => {
    expect(labelFor('coffee-brewed')).toBe('brewed coffee');
    expect(labelFor('cycle-logged')).toBe('logged cycle day');
  });

  test('falls back to the raw intent name for unknown ones', () => {
    expect(labelFor('third-party-custom-intent')).toBe('third-party-custom-intent');
  });

  test('covers every intent in INTENT_LABELS', () => {
    for (const [key, value] of Object.entries(INTENT_LABELS)) {
      expect(labelFor(key)).toBe(value);
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
