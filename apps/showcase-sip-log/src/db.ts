/**
 * Local persistence for sip-log.
 *
 * Uses localStorage. Sip rows are tiny (id + kind + ml + mg + ts + note?)
 * and rarely exceed a few hundred per month — wa-sqlite is overkill.
 *
 * Schema (v2):
 *   - sips: append-only event log of every drink. We keep 90 days now
 *     (was 30) so the weekly summary + streak counters have headroom.
 *   - targets: singleton; daily hydration goal, caffeine cap, cutoff hour.
 *
 * The Shippie runtime watches localStorage writes via the patina spine;
 * each sip also broadcasts a `hydration-logged` and/or `caffeine-logged`
 * intent to the container so Sleep Logger / Daily Briefing / Mood Pulse
 * get the live signal.
 */
const STORAGE_KEY = 'shippie.sip-log.v2';
const LEGACY_KEY = 'shippie.sip-log.v1';

export type SipKind = 'water' | 'coffee-espresso' | 'coffee-mug' | 'tea';

export interface Sip {
  id: string;
  kind: SipKind;
  /** Volume in ml. */
  ml: number;
  /** Caffeine in mg. */
  mg: number;
  /** ISO timestamp. */
  logged_at: string;
  /** Optional free-text note (e.g. "with breakfast"). */
  note?: string;
}

export interface Targets {
  /** Daily hydration goal in ml. Default 2000 (8 × 250 ml). */
  water_ml: number;
  /** Hour of day (0–23) after which caffeine becomes a sleep risk. Default 14. */
  caffeine_cutoff_hour: number;
  /** Daily ceiling for caffeine intake in mg. Default 400. */
  caffeine_max_mg: number;
}

interface Persisted {
  sips: Sip[];
  targets: Targets;
}

export const DEFAULT_TARGETS: Targets = {
  water_ml: 2000,
  caffeine_cutoff_hour: 14,
  caffeine_max_mg: 400,
};

/**
 * Quick-tap presets. Four buttons + a custom flow.
 *
 * Caffeine values follow USDA / common-knowledge averages:
 *   - espresso shot ≈ 64 mg in 30 ml
 *   - mug of brewed coffee ≈ 95 mg in 240 ml
 *   - black tea ≈ 28 mg in 240 ml
 */
export const PRESETS: Record<
  SipKind,
  { ml: number; mg: number; emoji: string; label: string; short: string }
> = {
  water: { ml: 250, mg: 0, emoji: '💧', label: 'Water', short: '250 ml' },
  'coffee-espresso': { ml: 30, mg: 64, emoji: '☕', label: 'Espresso', short: '30 ml · 64 mg' },
  'coffee-mug': { ml: 240, mg: 95, emoji: '☕', label: 'Mug', short: '240 ml · 95 mg' },
  tea: { ml: 240, mg: 28, emoji: '🍵', label: 'Tea', short: '240 ml · 28 mg' },
};

export function load(): Persisted {
  // Try v2 first, fall back to v1 (water/coffee/tea schema), then default.
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Persisted>;
      return normalise(parsed);
    }
  } catch {
    /* ignore */
  }
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as { sips?: Array<Sip & { kind: string }> };
      const migrated: Sip[] = (parsed.sips ?? []).map((s) => ({
        ...s,
        kind: migrateKind(s.kind),
      }));
      return { sips: migrated, targets: { ...DEFAULT_TARGETS } };
    }
  } catch {
    /* ignore */
  }
  return { sips: [], targets: { ...DEFAULT_TARGETS } };
}

function normalise(parsed: Partial<Persisted>): Persisted {
  const sips = Array.isArray(parsed.sips)
    ? parsed.sips.filter((s): s is Sip => isSip(s))
    : [];
  const targets = { ...DEFAULT_TARGETS, ...(parsed.targets ?? {}) };
  return { sips, targets };
}

function isSip(s: unknown): s is Sip {
  if (!s || typeof s !== 'object') return false;
  const r = s as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.kind === 'string' &&
    typeof r.ml === 'number' &&
    typeof r.mg === 'number' &&
    typeof r.logged_at === 'string'
  );
}

function migrateKind(legacy: string): SipKind {
  if (legacy === 'coffee') return 'coffee-mug';
  if (legacy === 'water' || legacy === 'tea') return legacy;
  return 'water';
}

export function save(state: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode — best-effort */
  }
}

export function newId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Drop sips older than 90 days so localStorage stays bounded. */
export function pruneOld(sips: Sip[], now: number = Date.now()): Sip[] {
  const cutoff = now - 90 * 24 * 60 * 60 * 1000;
  return sips.filter((s) => new Date(s.logged_at).getTime() >= cutoff);
}

/** YYYY-MM-DD bucket helpers. Uses local time so day-boundaries match the user's clock. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Update a single sip in place (immutable). */
export function updateSip(sips: Sip[], id: string, patch: Partial<Omit<Sip, 'id'>>): Sip[] {
  return sips.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

/** Remove a sip by id. */
export function removeSip(sips: Sip[], id: string): Sip[] {
  return sips.filter((s) => s.id !== id);
}
