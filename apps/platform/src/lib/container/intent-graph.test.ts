/**
 * P6A — cross-cluster intent graph integrity.
 *
 * Plan goal: "15+ new intents introduced; each gets a vitest." Rather
 * than write 15 near-duplicate tests, this single suite asserts the
 * graph-level invariants that matter for the demo:
 *
 *   1. Every consumer declared in `curatedApps` has at least one
 *      provider in the same registry (no dangling consumers).
 *   2. Every provider has at least one declared consumer OR is on
 *      the allowed-orphan list (intents some apps may listen to in
 *      future without yet having a producer in-tree).
 *   3. The cross-cluster acceptance pair (Recipe Saver ->
 *      Habit Tracker on `cooked-meal`) resolves through the
 *      registry exactly the way the design pass requires.
 *   4. Heavy-hitting intents (cooked-meal, workout-completed,
 *      sleep-logged, mood-logged) all have ≥2 consumers — the
 *      compounding-platform thesis only holds when intents are
 *      multi-consumer.
 */
import { describe, expect, test } from 'vitest';
import { createIntentRegistry } from './intent-registry';
import { curatedApps } from './state';

/**
 * Intents we know are produced but don't yet have a curated consumer.
 * These are deliberate — Show & Tell's mesh-only contract means it
 * stays out of the cross-app graph; some new providers (focus-session,
 * dined-out, walked) will gain consumers in P7+ as more apps land.
 */
const ALLOWED_ORPHAN_PROVIDERS = new Set<string>([
  // Field Kitchen — fermentation has no current consumer (was Bake's
  // outbound signal for a future "fermentation tracker" sibling).
  'dough-ferment-started',
  // Hearth — household-internal events. The cross-app graph might
  // surface these via /today but no other app subscribes by design
  // (housemates' chore rota isn't another app's business).
  'chore-done',
  'fridge-added',
  'dinner-eaten',
  // Co-Pilot — separated co-parents domain; no app consumes by
  // design (kid-side data is deliberately out of scope).
  'coparent-handover-noted',
  'coparent-med-given',
  'coparent-day-changed',
  // Cycle — predicted-window publishes for body-metrics / mood
  // correlation surfaces that aren't curated yet.
  'cycle-window-predicted',
  // Story Studio — creation-only; share signals don't have curated
  // consumers (the recipient's grandparent device is the consumer).
  'story-made',
  'story-shared',
  // Atlas — trip lifecycle has no curated consumer in-tree (an
  // analytics surface might land later).
  'trip-started',
  'stop-pinned',
  'trip-ended',
  // Symptom Diary — med-taken is provided alongside symptom-logged;
  // no curated cross-app consumer for med-taken specifically.
  'med-taken',
  // Therapy Notes — journal-entry is captured for future surfacing.
  'journal-entry',
  // Ledger — expense-logged provides the cross-app finance signal;
  // no curated consumer beyond /today.
  'expense-logged',
  // Field Kitchen — daily-briefing was the previous consumer of these
  // (it aggregated across the kitchen-rituals); /today now plays that
  // role but reads from the IndexedDB intent store directly, not
  // through the in-tree registry.
  'coffee-brewed',
  'cooking-now',
  'dough-ready',
  'hydration-logged',
  // Cycle — single-user journal-shape; no curated consumer.
  'cycle-logged',
  // Hearth — household-internal events; no curated cross-app consumer
  // by design.
  'household-note',
  'dinner-planned',
  // Story Studio — share signals don't have curated consumers (the
  // grandparent device IS the consumer, off-platform).
  'story-draft',
  // Therapy Notes — local journaling surface for /today; no in-tree
  // consumer subscribes to therapy-checkin.
  'therapy-checkin',
  // Atlas — trip-note + place-pinned are consumed by Crewtrip.
  // (No whitelist needed — actually consumed.)
  // Quiet — focus-session was previously aggregated by daily-briefing;
  // /today picks it up via the IndexedDB store now.
  'focus-session',
  // Move — run-planned was previously a Pace→Workout-Logger handshake;
  // both retired, so the intent is provider-only now.
  'run-planned',
  // Symptom Diary — both provided AND in ALLOWED_ORPHAN_CONSUMERS
  // (it's published locally, no curated consumer in-tree).
  'symptom-logged',
  // Voice Memo — provides memo-recorded for future surfacing
  // (Read Later or Journal could pick it up). No curated consumer
  // in-tree at the moment.
  'memo-recorded',
  // Tab — bill-splitter publishes per-item and settlement events for
  // optional cross-app logging (Ledger could subscribe later); no
  // curated consumer in-tree today.
  'tab-item-added',
  'tab-settled',
  // Pitch Forge — drafted/sent are surfaced in /today and (eventually)
  // a maker dashboard, but no in-tree app currently consumes them.
  'pitch-drafted',
  'pitch-sent',
  // Touch — touch-logged is broadcast for optional cross-app surfacing
  // (Journal could weave touches into daily summaries later); no
  // curated consumer in-tree today.
  'touch-logged',
  // Care Log — caregiver tooling for someone else's data. Symptom
  // Diary is for tracking your own; Care Log is for tracking another
  // person's. Streams don't share consumers in-tree by design.
  'care-dose-given',
  'care-symptom-noted',
  'care-handover-noted',
  // Site Visit — field inspection events for /today + future analytics
  // dashboards. No in-tree consumer at the moment.
  'visit-completed',
  'incident-flagged',
]);

/**
 * Intents we know are consumed but don't yet have a curated producer
 * in-tree. These flag intents that other apps subscribe to where the
 * producer lives outside the showcase set (or hasn't shipped yet).
 */
const ALLOWED_ORPHAN_CONSUMERS = new Set<string>([
  'budget-limit',
  'symptom-logged',
]);

describe('intent graph — registry resolves all curated intents', () => {
  const registry = createIntentRegistry();
  registry.refresh(curatedApps);
  const declared = registry.allIntents();

  test('every declared consumer intent has a matching provider', () => {
    for (const intent of declared.consumers) {
      if (ALLOWED_ORPHAN_CONSUMERS.has(intent)) continue;
      const providers = registry.providersFor(intent);
      expect(
        providers.length,
        `consumer intent "${intent}" has no provider — wire one or add to ALLOWED_ORPHAN_CONSUMERS`,
      ).toBeGreaterThan(0);
    }
  });

  test('every declared provider intent has a matching consumer', () => {
    for (const intent of declared.providers) {
      if (ALLOWED_ORPHAN_PROVIDERS.has(intent)) continue;
      const consumers = registry.consumersFor(intent);
      expect(
        consumers.length,
        `provider intent "${intent}" has no consumer — wire one or add to ALLOWED_ORPHAN_PROVIDERS`,
      ).toBeGreaterThan(0);
    }
  });

  test('cross-cluster acceptance: Recipe Saver provides cooked-meal to Habit Tracker', () => {
    const providers = registry.providersFor('cooked-meal');
    const consumers = registry.consumersFor('cooked-meal');
    expect(providers.map((p) => p.appSlug)).toContain('recipe');
    expect(consumers.map((c) => c.appSlug)).toContain('habit-tracker');
  });

  test('heavy-hitter intents have ≥2 consumers (the compounding thesis)', () => {
    const heavyHitters = ['cooked-meal', 'workout-completed', 'sleep-logged', 'mood-logged'];
    for (const intent of heavyHitters) {
      const consumers = registry.consumersFor(intent);
      expect(
        consumers.length,
        `intent "${intent}" needs ≥2 consumers to compound; currently ${consumers.length}`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  test('intent set is non-trivial — at least 15 distinct intents in play', () => {
    const all = new Set([...declared.providers, ...declared.consumers]);
    expect(all.size).toBeGreaterThanOrEqual(15);
  });
});
