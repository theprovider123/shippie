/**
 * Recurring staples — milk, bread, eggs, etc.
 *
 * The model: each spec has a cadence (days). When `lastQueuedAt` is
 * older than `cadenceDays` ago AND `lastBoughtAt` is also older than
 * cadence ago, we queue an item for the user. If they tick it off,
 * `lastBoughtAt` advances. If they ignore or delete it,
 * `lastQueuedAt` still advanced so we don't re-queue it every render.
 *
 * `pantry-low` events from the Pantry Scanner can either *bump* an
 * existing spec's `lastBoughtAt` to "now-cadence-1d" (so it queues
 * again on the next tick) or just bypass the spec system entirely —
 * they already get auto-added by the existing pantry-low handler. We
 * keep the bump path optional via `markBoughtFromPantryLow`.
 */
import type { ListItem, RecurringSpec } from './types.ts';

export const DEFAULT_RECURRING_STAPLES: ReadonlyArray<{
  name: string;
  cadenceDays: number;
}> = [
  { name: 'milk', cadenceDays: 5 },
  { name: 'bread', cadenceDays: 4 },
  { name: 'eggs', cadenceDays: 7 },
  { name: 'butter', cadenceDays: 14 },
  { name: 'bananas', cadenceDays: 5 },
  { name: 'coffee', cadenceDays: 21 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function makeSpec(input: {
  name: string;
  cadenceDays?: number;
  id?: string;
  now?: number;
}): RecurringSpec {
  return {
    id: input.id ?? `r_${(input.now ?? Date.now()).toString(36)}_${input.name.replace(/\W+/g, '')}`,
    name: input.name.trim(),
    cadenceDays: Math.max(1, input.cadenceDays ?? 7),
    lastQueuedAt: null,
    lastBoughtAt: null,
  };
}

/**
 * Decide which specs should be queued onto the live list right now.
 * Pure: takes existing items + specs + clock; returns the items to
 * append and the specs whose `lastQueuedAt` should advance.
 *
 * Items already on the list (case-insensitive, unchecked) do NOT get
 * a duplicate queued — we don't want a recurring staple to spam the
 * user when they've already added "milk" themselves.
 */
export interface RecurringTickResult {
  /** New items to insert at the top of the list. */
  toQueue: ListItem[];
  /** Updated specs with advanced `lastQueuedAt`. */
  updatedSpecs: RecurringSpec[];
}

export function tickRecurring(input: {
  specs: readonly RecurringSpec[];
  items: readonly ListItem[];
  now: number;
}): RecurringTickResult {
  const { specs, items, now } = input;
  const liveByName = new Set(
    items.filter((i) => !i.checked).map((i) => i.name.toLowerCase()),
  );
  const toQueue: ListItem[] = [];
  const updatedSpecs: RecurringSpec[] = [];

  for (const spec of specs) {
    if (spec.paused) {
      updatedSpecs.push(spec);
      continue;
    }
    if (liveByName.has(spec.name.toLowerCase())) {
      updatedSpecs.push(spec);
      continue;
    }
    const cadenceMs = spec.cadenceDays * DAY_MS;
    const lastBought = spec.lastBoughtAt ? Date.parse(spec.lastBoughtAt) : 0;
    const lastQueued = spec.lastQueuedAt ? Date.parse(spec.lastQueuedAt) : 0;
    const reference = Math.max(lastBought, lastQueued);
    const due = reference === 0 ? true : now - reference >= cadenceMs;
    if (!due) {
      updatedSpecs.push(spec);
      continue;
    }
    toQueue.push({
      id: `i_${now}_${spec.id}`,
      name: spec.name,
      checked: false,
      source: 'recurring',
      addedAt: new Date(now).toISOString(),
      recurringSpecId: spec.id,
    });
    updatedSpecs.push({ ...spec, lastQueuedAt: new Date(now).toISOString() });
  }

  return { toQueue, updatedSpecs };
}

/**
 * When the user ticks off a recurring item, advance its
 * `lastBoughtAt`. Defensive: if the item isn't recurring, return
 * specs unchanged.
 */
export function markBought(
  specs: readonly RecurringSpec[],
  item: Pick<ListItem, 'recurringSpecId' | 'name'>,
  now: number,
): RecurringSpec[] {
  return specs.map((spec) => {
    const matchById = item.recurringSpecId && spec.id === item.recurringSpecId;
    const matchByName = !item.recurringSpecId && spec.name.toLowerCase() === item.name.toLowerCase();
    if (matchById || matchByName) {
      return { ...spec, lastBoughtAt: new Date(now).toISOString() };
    }
    return spec;
  });
}

export function pauseSpec(
  specs: readonly RecurringSpec[],
  id: string,
  paused: boolean,
): RecurringSpec[] {
  return specs.map((s) => (s.id === id ? { ...s, paused } : s));
}

export function setCadence(
  specs: readonly RecurringSpec[],
  id: string,
  cadenceDays: number,
): RecurringSpec[] {
  const clamped = Math.max(1, Math.round(cadenceDays));
  return specs.map((s) => (s.id === id ? { ...s, cadenceDays: clamped } : s));
}

export function removeSpec(
  specs: readonly RecurringSpec[],
  id: string,
): RecurringSpec[] {
  return specs.filter((s) => s.id !== id);
}

export function addSpec(
  specs: readonly RecurringSpec[],
  spec: RecurringSpec,
): RecurringSpec[] {
  if (specs.some((s) => s.name.toLowerCase() === spec.name.toLowerCase())) {
    return [...specs];
  }
  return [...specs, spec];
}

/**
 * Convenience: human-friendly description of when the spec is due.
 */
export function nextDueLabel(spec: RecurringSpec, now: number): string {
  if (spec.paused) return 'paused';
  const reference = Math.max(
    spec.lastBoughtAt ? Date.parse(spec.lastBoughtAt) : 0,
    spec.lastQueuedAt ? Date.parse(spec.lastQueuedAt) : 0,
  );
  if (reference === 0) return 'due now';
  const dueAt = reference + spec.cadenceDays * DAY_MS;
  const diffMs = dueAt - now;
  if (diffMs <= 0) return 'due now';
  const days = Math.round(diffMs / DAY_MS);
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days} days`;
}
