/**
 * Low-stock prediction — given a consumption log and current inventory,
 * surface items the user usually has but currently doesn't.
 *
 * Algorithm (deliberately simple — no ML, just frequency over recency):
 *   1. Group consumption events by `nameKey`.
 *   2. For each key, compute the average inter-event interval over the
 *      last N events (default 6).
 *   3. If the time since the *last* consumption > 1.5 × average AND the
 *      item is not currently in stock, flag it as "predicted out".
 *
 * The 1.5× hysteresis stops us crying wolf the moment the average is
 * crossed — the user might just be a day late on the next yoghurt run.
 *
 * Threshold tuning: we need at least MIN_EVENTS observations before
 * predicting. Below that, the user simply hasn't built a baseline.
 */
import type { ConsumptionEvent, Item } from './types.ts';
import { nameKey } from './storage.ts';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface LowStockPrediction {
  /** The name-key the consumption log is grouped on. */
  nameKey: string;
  /** Display name from the most recent matching item, or fallback. */
  name: string;
  /** Days the user typically goes between purchases. */
  averageIntervalDays: number;
  /** Days since the last recorded consumption. */
  daysSinceLast: number;
  /** Number of observations used. */
  sampleSize: number;
}

export interface PredictOptions {
  /** Number of recent events used for the average. Default 6. */
  windowSize?: number;
  /** Minimum events required before any prediction. Default 3. */
  minEvents?: number;
  /** Multiplier on the average interval before flagging. Default 1.5. */
  overdueMultiplier?: number;
  /**
   * Items currently in stock — predictions are suppressed for any
   * `nameKey` already present here.
   */
  inStock?: readonly Item[];
  /** Override the clock for tests. */
  now?: number;
}

const DEFAULTS: Required<Omit<PredictOptions, 'inStock' | 'now'>> = {
  windowSize: 6,
  minEvents: 3,
  overdueMultiplier: 1.5,
};

export function predictLowStock(
  events: readonly ConsumptionEvent[],
  options: PredictOptions = {},
): LowStockPrediction[] {
  const opts = { ...DEFAULTS, ...options };
  const now = options.now ?? Date.now();
  const inStockKeys = new Set(
    (options.inStock ?? [])
      .filter((it) => it.quantity > 0)
      .map((it) => it.nameKey),
  );

  const byKey = new Map<string, ConsumptionEvent[]>();
  for (const ev of events) {
    const list = byKey.get(ev.nameKey);
    if (list) list.push(ev);
    else byKey.set(ev.nameKey, [ev]);
  }

  const predictions: LowStockPrediction[] = [];
  for (const [key, list] of byKey) {
    if (inStockKeys.has(key)) continue;
    if (list.length < opts.minEvents) continue;

    // Sort ascending by `at`, take last N.
    const sorted = [...list].sort(
      (a, b) => Date.parse(a.at) - Date.parse(b.at),
    );
    const window = sorted.slice(-opts.windowSize);
    const intervals: number[] = [];
    for (let i = 1; i < window.length; i += 1) {
      const t1 = Date.parse(window[i - 1]!.at);
      const t2 = Date.parse(window[i]!.at);
      if (Number.isFinite(t1) && Number.isFinite(t2) && t2 >= t1) {
        intervals.push((t2 - t1) / ONE_DAY_MS);
      }
    }
    if (intervals.length === 0) continue;

    const avg =
      intervals.reduce((s, x) => s + x, 0) / intervals.length;
    if (avg <= 0) continue;

    const last = window[window.length - 1]!;
    const lastT = Date.parse(last.at);
    if (!Number.isFinite(lastT)) continue;
    const daysSinceLast = (now - lastT) / ONE_DAY_MS;
    if (daysSinceLast < avg * opts.overdueMultiplier) continue;

    predictions.push({
      nameKey: key,
      name: prettyName(key),
      averageIntervalDays: round1(avg),
      daysSinceLast: round1(daysSinceLast),
      sampleSize: window.length,
    });
  }

  // Most overdue first.
  predictions.sort(
    (a, b) =>
      b.daysSinceLast / b.averageIntervalDays -
      a.daysSinceLast / a.averageIntervalDays,
  );
  return predictions;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function prettyName(key: string): string {
  // The key has been stripped of punctuation and lowercased; recover a
  // display string by capitalising each word. The caller may override
  // with a real display name when one is available.
  return key
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Helper to record a consumption event from the current item state.
 * Centralised so every entry point uses the same `nameKey` rule.
 */
export function consumptionEventFromItem(
  item: Pick<Item, 'name' | 'nameKey'>,
  source: ConsumptionEvent['source'],
  at: string = new Date().toISOString(),
  quantity?: number,
): ConsumptionEvent {
  return {
    nameKey: item.nameKey || nameKey(item.name),
    at,
    source,
    quantity,
  };
}
