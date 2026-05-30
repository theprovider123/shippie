/**
 * Readiness store — the live glue between the intent bus and the score.
 *
 * Subscribes to the seven inbound recovery intents, folds each broadcast
 * into a small timestamped signal cache, and recomputes the readiness
 * verdict. Signals expire on per-field TTLs so a three-day-old sleep
 * reading can't masquerade as last night's. Everything persists to
 * localStorage and lives only on this device — nothing is uploaded.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  matchReadinessSignal,
  scoreReadiness,
  type ReadinessResult,
  type ReadinessSignals,
} from '../utils/readiness.ts';
import { subscribeReadinessSignals } from './intent-bus.ts';

const STORE_KEY = 'shippie:lift:readiness';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface Stamped<T> {
  v: T;
  at: number;
}

interface ReadinessStore {
  sleepHours?: Stamped<number>;
  sleepQuality?: Stamped<number>;
  proteinTargetHit?: Stamped<boolean>;
  nutritionUnderTarget?: Stamped<boolean>;
  hydrationLoggedToday?: Stamped<boolean>;
  caffeineCountToday?: Stamped<number>;
  cyclePhase?: Stamped<NonNullable<ReadinessSignals['cyclePhase']>>;
  /** Recent bodyweight readings (kg), newest last, capped at 6. */
  weightHistory?: Array<Stamped<number>>;
}

// How long each signal stays "current".
const TTL: Record<keyof Omit<ReadinessStore, 'weightHistory'>, number> = {
  sleepHours: 20 * HOUR,
  sleepQuality: 20 * HOUR,
  proteinTargetHit: 1 * DAY,
  nutritionUnderTarget: 1 * DAY,
  hydrationLoggedToday: 1 * DAY,
  caffeineCountToday: 18 * HOUR,
  cyclePhase: 3 * DAY,
};

function load(): ReadinessStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as ReadinessStore) : {};
  } catch {
    return {};
  }
}

function save(store: ReadinessStore): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // private mode — readiness is best-effort, never load-bearing
  }
}

/** Pull the current bodyweight out of a body-metrics-logged row. */
function readWeight(rows: readonly unknown[]): number | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r && typeof r === 'object') {
      const o = r as Record<string, unknown>;
      const w = o.weight_kg ?? o.weight ?? o.bodyweight ?? o.mass_kg;
      if (typeof w === 'number' && Number.isFinite(w)) return w;
    }
  }
  return null;
}

/** Apply one inbound broadcast to the store, returning the next store. */
export function applyBroadcast(
  store: ReadinessStore,
  intent: string,
  rows: readonly unknown[],
  now: number,
): ReadinessStore {
  if (intent === 'body-metrics-logged') {
    const w = readWeight(rows);
    if (w == null) return store;
    const history = [...(store.weightHistory ?? []), { v: w, at: now }].slice(-6);
    return { ...store, weightHistory: history };
  }
  const patch = matchReadinessSignal(intent, rows);
  if (!patch) return store;
  const next = { ...store };
  if (patch.sleepHours != null) next.sleepHours = { v: patch.sleepHours, at: now };
  if (patch.sleepQuality != null) next.sleepQuality = { v: patch.sleepQuality, at: now };
  if (patch.proteinTargetHit != null)
    next.proteinTargetHit = { v: patch.proteinTargetHit, at: now };
  if (patch.nutritionUnderTarget != null)
    next.nutritionUnderTarget = { v: patch.nutritionUnderTarget, at: now };
  if (patch.hydrationLoggedToday != null)
    next.hydrationLoggedToday = { v: patch.hydrationLoggedToday, at: now };
  if (patch.caffeineCountToday != null)
    next.caffeineCountToday = { v: patch.caffeineCountToday, at: now };
  if (patch.cyclePhase != null) next.cyclePhase = { v: patch.cyclePhase, at: now };
  return next;
}

/** Collapse the timestamped store into fresh, TTL-pruned signals. */
export function deriveSignals(store: ReadinessStore, now: number): ReadinessSignals {
  const out: ReadinessSignals = {};
  const fresh = <T>(s: Stamped<T> | undefined, ttl: number): T | undefined =>
    s && now - s.at <= ttl ? s.v : undefined;

  out.sleepHours = fresh(store.sleepHours, TTL.sleepHours);
  out.sleepQuality = fresh(store.sleepQuality, TTL.sleepQuality);
  out.proteinTargetHit = fresh(store.proteinTargetHit, TTL.proteinTargetHit);
  out.nutritionUnderTarget = fresh(store.nutritionUnderTarget, TTL.nutritionUnderTarget);
  out.hydrationLoggedToday = fresh(store.hydrationLoggedToday, TTL.hydrationLoggedToday);

  const caffeine = store.caffeineCountToday;
  if (caffeine && now - caffeine.at <= TTL.caffeineCountToday) {
    out.caffeineCountToday = caffeine.v;
    out.caffeineRecentMinutes = Math.round((now - caffeine.at) / MINUTE);
  }

  out.cyclePhase = fresh(store.cyclePhase, TTL.cyclePhase);

  // Bodyweight delta: latest reading vs the oldest within a 10-day window.
  const history = (store.weightHistory ?? []).filter((w) => now - w.at <= 10 * DAY);
  if (history.length >= 2) {
    const latest = history[history.length - 1]!;
    const earliest = history[0]!;
    if (earliest.v > 0) {
      out.bodyWeightDeltaPct = ((latest.v - earliest.v) / earliest.v) * 100;
    }
  }
  return out;
}

export interface UseReadiness {
  readiness: ReadinessResult;
  /** True once at least one signal has arrived (persisted or live). */
  hasSignals: boolean;
}

/**
 * React hook: subscribe to recovery intents and expose a live readiness
 * verdict. Recomputes on every inbound broadcast.
 */
export function useReadiness(): UseReadiness {
  const storeRef = useRef<ReadinessStore>({});
  const [signals, setSignals] = useState<ReadinessSignals>({});

  useEffect(() => {
    storeRef.current = load();
    setSignals(deriveSignals(storeRef.current, Date.now()));

    const off = subscribeReadinessSignals((intent, rows) => {
      const now = Date.now();
      storeRef.current = applyBroadcast(storeRef.current, intent, rows, now);
      save(storeRef.current);
      setSignals(deriveSignals(storeRef.current, now));
    });
    return off;
  }, []);

  const readiness = useMemo(() => scoreReadiness(signals), [signals]);
  const hasSignals = readiness.honest;
  return { readiness, hasSignals };
}
