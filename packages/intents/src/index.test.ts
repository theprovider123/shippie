import { describe, expect, test } from 'bun:test';
import {
  CANONICAL_INTENTS,
  LEGACY_INTENT_ALIASES,
  canonicalIntentFor,
  isKnownIntent,
  validateIntentPayload,
} from './index';

describe('@shippie/intents', () => {
  test('keeps the launch vocabulary to twelve canonical families', () => {
    expect(CANONICAL_INTENTS).toHaveLength(12);
  });

  test('maps legacy app strings to canonical families', () => {
    expect(canonicalIntentFor('cooked-meal')).toBe('meals.log.v1');
    expect(canonicalIntentFor('sleep-logged')).toBe('sleep.entry.v1');
    expect(canonicalIntentFor('expense-logged')).toBe('expense.receipt.v1');
  });

  test('recognises canonical ids directly', () => {
    expect(isKnownIntent('meals.log.v1')).toBe(true);
    expect(canonicalIntentFor('meals.log.v1')).toBe('meals.log.v1');
  });

  test('does not silently accept unknown strings', () => {
    expect(isKnownIntent('random.future.intent')).toBe(false);
    expect(validateIntentPayload('random.future.intent', {})).toEqual({
      ok: false,
      error: 'unknown intent: random.future.intent',
    });
  });

  test('all aliases point at a real canonical definition', () => {
    const ids = new Set(CANONICAL_INTENTS.map((intent) => intent.id));
    for (const [alias, canonical] of Object.entries(LEGACY_INTENT_ALIASES)) {
      expect(ids.has(canonical), alias).toBe(true);
    }
  });
});
