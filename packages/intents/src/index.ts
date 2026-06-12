export interface IntentPayloadSchema {
  type: 'object';
  required?: readonly string[];
  properties: Record<string, { type: string; description?: string }>;
  additionalProperties: boolean;
}

export type CanonicalIntentId =
  | 'meals.log.v1'
  | 'pantry.inventory.v1'
  | 'shopping.list.v1'
  | 'workout.session.v1'
  | 'sleep.entry.v1'
  | 'mood.rating.v1'
  | 'hydration.entry.v1'
  | 'symptom.entry.v1'
  | 'focus.session.v1'
  | 'expense.receipt.v1'
  | 'memory.capture.v1'
  | 'live.event.v1';

export interface CanonicalIntentDefinition {
  id: CanonicalIntentId;
  title: string;
  description: string;
  schema: IntentPayloadSchema;
  examples: readonly Record<string, unknown>[];
}

const baseSchema = (properties: IntentPayloadSchema['properties']): IntentPayloadSchema => ({
  type: 'object',
  properties,
  additionalProperties: true,
});

export const CANONICAL_INTENTS = [
  {
    id: 'meals.log.v1',
    title: 'Meal Logged',
    description: 'A meal, recipe, pantry action, or food plan the user intentionally recorded.',
    schema: baseSchema({
      at: { type: 'string' },
      title: { type: 'string' },
      source: { type: 'string' },
    }),
    examples: [{ at: '2026-05-31T18:30:00.000Z', title: 'Dinner', source: 'palate' }],
  },
  {
    id: 'pantry.inventory.v1',
    title: 'Pantry Inventory',
    description: 'A pantry stock, low-stock, or restock signal.',
    schema: baseSchema({
      item: { type: 'string' },
      quantity: { type: 'number' },
      unit: { type: 'string' },
    }),
    examples: [{ item: 'rice', quantity: 1, unit: 'kg' }],
  },
  {
    id: 'shopping.list.v1',
    title: 'Shopping List',
    description: 'A shopping list, restock list, or budget-shopping handoff.',
    schema: baseSchema({
      item: { type: 'string' },
      checked: { type: 'boolean' },
      source: { type: 'string' },
    }),
    examples: [{ item: 'lemons', checked: false, source: 'palate' }],
  },
  {
    id: 'workout.session.v1',
    title: 'Workout Session',
    description: 'Movement, strength, body metrics, and training readiness signals.',
    schema: baseSchema({
      at: { type: 'string' },
      kind: { type: 'string' },
      value: { type: 'number' },
    }),
    examples: [{ at: '2026-05-31T07:00:00.000Z', kind: 'strength', value: 45 }],
  },
  {
    id: 'sleep.entry.v1',
    title: 'Sleep Entry',
    description: 'Sleep duration, quality, or rest-window signals.',
    schema: baseSchema({
      date: { type: 'string' },
      hours: { type: 'number' },
      quality: { type: 'number' },
    }),
    examples: [{ date: '2026-05-31', hours: 7.5, quality: 4 }],
  },
  {
    id: 'mood.rating.v1',
    title: 'Mood Rating',
    description: 'Mood, feeling, preference, or reflective check-in signals.',
    schema: baseSchema({
      at: { type: 'string' },
      value: { type: 'number' },
      note: { type: 'string' },
    }),
    examples: [{ at: '2026-05-31T09:00:00.000Z', value: 4, note: 'steady' }],
  },
  {
    id: 'hydration.entry.v1',
    title: 'Hydration Entry',
    description: 'Water, caffeine, tea, and related intake signals.',
    schema: baseSchema({
      at: { type: 'string' },
      amount: { type: 'number' },
      unit: { type: 'string' },
    }),
    examples: [{ at: '2026-05-31T10:15:00.000Z', amount: 250, unit: 'ml' }],
  },
  {
    id: 'symptom.entry.v1',
    title: 'Symptom Entry',
    description: 'Symptoms, medication, cycle, and care-log health events.',
    schema: baseSchema({
      at: { type: 'string' },
      symptom: { type: 'string' },
      severity: { type: 'number' },
    }),
    examples: [{ at: '2026-05-31T12:00:00.000Z', symptom: 'headache', severity: 2 }],
  },
  {
    id: 'focus.session.v1',
    title: 'Focus Session',
    description: 'Breathing, focus, quiet, and mindful ritual sessions.',
    schema: baseSchema({
      at: { type: 'string' },
      durationMs: { type: 'number' },
      mode: { type: 'string' },
    }),
    examples: [{ at: '2026-05-31T14:00:00.000Z', durationMs: 300000, mode: 'breath' }],
  },
  {
    id: 'expense.receipt.v1',
    title: 'Expense Receipt',
    description: 'Receipts, bills, tab splits, and private ledger events.',
    schema: baseSchema({
      at: { type: 'string' },
      total: { type: 'number' },
      currency: { type: 'string' },
    }),
    examples: [{ at: '2026-05-31T20:10:00.000Z', total: 42.5, currency: 'GBP' }],
  },
  {
    id: 'memory.capture.v1',
    title: 'Memory Capture',
    description: 'Photos, notes, voice memos, stories, places, visits, and personal records.',
    schema: baseSchema({
      at: { type: 'string' },
      title: { type: 'string' },
      mediaType: { type: 'string' },
    }),
    examples: [{ at: '2026-05-31T15:45:00.000Z', title: 'Site note', mediaType: 'text' }],
  },
  {
    id: 'live.event.v1',
    title: 'Live Event',
    description: 'Games, room sessions, matchday, trip, household, and other live coordination events.',
    schema: baseSchema({
      at: { type: 'string' },
      kind: { type: 'string' },
      result: { type: 'string' },
    }),
    examples: [{ at: '2026-05-31T16:20:00.000Z', kind: 'game.completed', result: 'won' }],
  },
] as const satisfies readonly CanonicalIntentDefinition[];

export const LEGACY_INTENT_ALIASES = {
  'body-metrics-logged': 'workout.session.v1',
  'brewed-tea': 'hydration.entry.v1',
  'budget-limit': 'expense.receipt.v1',
  'caffeine-logged': 'hydration.entry.v1',
  'care-dose-given': 'symptom.entry.v1',
  'care-handover-noted': 'symptom.entry.v1',
  'care-symptom-noted': 'symptom.entry.v1',
  'chore-done': 'live.event.v1',
  'coffee-brewed': 'hydration.entry.v1',
  'cooked-meal': 'meals.log.v1',
  'cooking-now': 'meals.log.v1',
  'counter.tapped': 'live.event.v1',
  'custody-event': 'live.event.v1',
  'cycle-logged': 'symptom.entry.v1',
  'cycle-window-predicted': 'symptom.entry.v1',
  'deload-recommended': 'workout.session.v1',
  'dined-out': 'meals.log.v1',
  'dinner-planned': 'meals.log.v1',
  'dough-ferment-started': 'meals.log.v1',
  'dough-ready': 'meals.log.v1',
  'event.feedback': 'live.event.v1',
  'event-memory': 'memory.capture.v1',
  'event-plan': 'live.event.v1',
  'event-score': 'live.event.v1',
  'event.session.attendance': 'live.event.v1',
  'expense-logged': 'expense.receipt.v1',
  'fantasy-team.saved': 'live.event.v1',
  'feeling-logged': 'mood.rating.v1',
  'focus-session': 'focus.session.v1',
  'game.completed': 'live.event.v1',
  'habit-logged': 'mood.rating.v1',
  'handover-note': 'live.event.v1',
  'household-note': 'memory.capture.v1',
  'hydration-logged': 'hydration.entry.v1',
  'incident-flagged': 'memory.capture.v1',
  'live-match-status': 'live.event.v1',
  'macro-target-updated': 'meals.log.v1',
  'market.checked-in': 'live.event.v1',
  'market.event-reserved': 'live.event.v1',
  'market.vendor-viewed': 'memory.capture.v1',
  'matchday-prediction-stats': 'live.event.v1',
  'matchday-room-feed': 'live.event.v1',
  'meal-logged': 'meals.log.v1',
  'meal-planned': 'meals.log.v1',
  'med-taken': 'symptom.entry.v1',
  'meds-logged': 'symptom.entry.v1',
  'memo-recorded': 'memory.capture.v1',
  'mindful-session': 'focus.session.v1',
  'mood-logged': 'mood.rating.v1',
  'mood.color_picked': 'mood.rating.v1',
  'needs-restocking': 'shopping.list.v1',
  'nutrition-logged': 'meals.log.v1',
  'pantry-inventory': 'pantry.inventory.v1',
  'pantry-low': 'pantry.inventory.v1',
  'period-started': 'symptom.entry.v1',
  'photo.labelled': 'memory.capture.v1',
  'pitch-drafted': 'memory.capture.v1',
  'pitch-sent': 'memory.capture.v1',
  'place-pinned': 'memory.capture.v1',
  'place.snapped': 'memory.capture.v1',
  'pr-broken': 'workout.session.v1',
  'preference.choice': 'mood.rating.v1',
  'protein-target-hit': 'meals.log.v1',
  'puzzle.cleared': 'live.event.v1',
  'race.cutoff-risk': 'workout.session.v1',
  'race.finished': 'workout.session.v1',
  'race.gps-fix': 'workout.session.v1',
  'restaurant-feedback': 'live.event.v1',
  'restaurant-order': 'meals.log.v1',
  'run-planned': 'workout.session.v1',
  'set-logged': 'workout.session.v1',
  'share-card': 'memory.capture.v1',
  'shopping-list': 'shopping.list.v1',
  'sleep-logged': 'sleep.entry.v1',
  'story-draft': 'memory.capture.v1',
  'story-made': 'memory.capture.v1',
  'story-shared': 'memory.capture.v1',
  'symptom-logged': 'symptom.entry.v1',
  'symptom-pattern-detected': 'symptom.entry.v1',
  'tab-item-added': 'expense.receipt.v1',
  'tab-settled': 'expense.receipt.v1',
  'therapy-checkin': 'mood.rating.v1',
  'touch-logged': 'memory.capture.v1',
  'training-load-updated': 'workout.session.v1',
  'trip-note': 'memory.capture.v1',
  'user-display-name': 'live.event.v1',
  'visit-completed': 'memory.capture.v1',
  'voice.recorded': 'memory.capture.v1',
  'wave.cleared': 'live.event.v1',
  'weekly-review-created': 'mood.rating.v1',
  'wellness-ritual': 'focus.session.v1',
  'wedding.memory-uploaded': 'memory.capture.v1',
  'wedding.song-requested': 'live.event.v1',
  'wedding.table-searched': 'live.event.v1',
  'workout-completed': 'workout.session.v1',
  'workout-started': 'workout.session.v1',
  'world-cup-bracket': 'live.event.v1',
  // The Cannon — Arsenal matchday companion.
  'match-starting': 'live.event.v1',
  'score-updated': 'live.event.v1',
  'fan-reaction': 'live.event.v1',
} as const satisfies Record<string, CanonicalIntentId>;

export type LegacyIntentId = keyof typeof LEGACY_INTENT_ALIASES;
export type KnownIntentId = CanonicalIntentId | LegacyIntentId;

export const knownIntentIds: readonly KnownIntentId[] = [
  ...CANONICAL_INTENTS.map((intent) => intent.id),
  ...Object.keys(LEGACY_INTENT_ALIASES),
] as readonly KnownIntentId[];

const CANONICAL_BY_ID = new Map<CanonicalIntentId, CanonicalIntentDefinition>(
  CANONICAL_INTENTS.map((intent) => [intent.id, intent]),
);

export function canonicalIntentFor(intent: string): CanonicalIntentId | null {
  if (CANONICAL_BY_ID.has(intent as CanonicalIntentId)) return intent as CanonicalIntentId;
  return LEGACY_INTENT_ALIASES[intent as LegacyIntentId] ?? null;
}

export function isKnownIntent(intent: string): intent is KnownIntentId {
  return canonicalIntentFor(intent) !== null;
}

export function intentDefinitionFor(intent: string): CanonicalIntentDefinition | null {
  const canonical = canonicalIntentFor(intent);
  return canonical ? CANONICAL_BY_ID.get(canonical) ?? null : null;
}

export function validateIntentPayload(intent: string, payload: unknown): { ok: true } | { ok: false; error: string } {
  const definition = intentDefinitionFor(intent);
  if (!definition) return { ok: false, error: `unknown intent: ${intent}` };
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'payload must be an object' };
  }
  return { ok: true };
}
