/**
 * Community data client for the Terrace, the Gauge, and match predictions.
 * Online it talks to the platform routes (/api/cannon/*); offline it degrades
 * to the last-good localStorage snapshot, then to the seeded launch takes.
 * Writes are optimistic; the server is the tie-breaker on the next fetch.
 */
import { SEED_TAKES } from '../data/takes-seed';
import { getAnonKey } from './handle';
import type {
  GaugeSummary,
  Mood,
  PredictionPick,
  PredictionSummary,
  ReportReason,
  Take,
  Thread,
  VoteDir,
} from './types';

// Same-origin in production; the platform dev server in development.
const API_BASE = import.meta.env.DEV ? 'http://localhost:4101' : '';

const TAKES_CACHE = 'cannon_takes_cache';
const GAUGE_CACHE = 'cannon_gauge_cache';
const LOCAL_TAKES = 'cannon_local_takes';
const PREDICT_CACHE = 'cannon_predict_cache';

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / private mode */
  }
}

// ── Takes ────────────────────────────────────────────────────────────────────

/** Takes composed while offline, replayed into view until the API confirms. */
function localTakes(): Take[] {
  return readJSON<Take[]>(LOCAL_TAKES) ?? [];
}

export function fallbackTakes(): Take[] {
  const cached = readJSON<Take[]>(TAKES_CACHE);
  const base = cached ?? SEED_TAKES;
  const seen = new Set(base.map((t) => t.id));
  return [...localTakes().filter((t) => !seen.has(t.id)), ...base];
}

export async function fetchTakes(matchId?: string | null): Promise<{ takes: Take[]; online: boolean }> {
  try {
    const match = matchId ? `&match=${encodeURIComponent(matchId)}` : '';
    const res = await fetch(`${API_BASE}/api/cannon/takes?anonKey=${getAnonKey()}${match}`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const body = (await res.json()) as { takes: Take[] };
      if (Array.isArray(body.takes)) {
        // Match-scoped fetches don't clobber the general cache.
        if (!matchId) writeJSON(TAKES_CACHE, body.takes);
        // Server now owns anything it returned; drop confirmed local copies.
        const serverTexts = new Set(body.takes.map((t) => `${t.handle}:${t.text}`));
        const pending = localTakes().filter((t) => !serverTexts.has(`${t.handle}:${t.text}`));
        if (!matchId) writeJSON(LOCAL_TAKES, pending);
        const localForView = matchId ? pending.filter((t) => t.matchId === matchId) : pending;
        return { takes: [...localForView, ...body.takes], online: true };
      }
    }
  } catch {
    /* offline or blocked */
  }
  const all = fallbackTakes();
  return { takes: matchId ? all.filter((t) => t.matchId === matchId) : all, online: false };
}

/**
 * Persist a composed take. The caller shows `optimistic` instantly; this
 * trades it for the server's copy when online, or stores it for replay
 * when offline. A `blocked` result means the server's language gate said no.
 */
export async function postTake(
  optimistic: Take,
): Promise<{ take: Take; online: boolean; blocked?: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/api/cannon/takes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        handle: optimistic.handle,
        thread: optimistic.thread,
        text: optimistic.text,
        matchId: optimistic.matchId,
        anonKey: getAnonKey(),
      }),
    });
    if (res.ok) {
      const body = (await res.json()) as { take: Take };
      return { take: body.take, online: true };
    }
    if (res.status === 400) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (body?.error === 'blocked-language') {
        return { take: optimistic, online: true, blocked: true };
      }
    }
  } catch {
    /* offline */
  }
  writeJSON(LOCAL_TAKES, [optimistic, ...localTakes()]);
  return { take: optimistic, online: false };
}

export function buildTake(handle: string, thread: Thread, text: string, matchId: string | null = null): Take {
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    handle,
    thread,
    text,
    matchId,
    up: 0,
    down: 0,
    createdAt: Date.now(),
    myVote: null,
  };
}

export async function postVote(
  takeId: string,
  dir: VoteDir,
): Promise<{ up: number; down: number; myVote: VoteDir } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/cannon/votes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ takeId, anonKey: getAnonKey(), dir }),
    });
    if (res.ok) return (await res.json()) as { up: number; down: number; myVote: VoteDir };
  } catch {
    /* offline — optimistic state stands */
  }
  return null;
}

export async function postReport(takeId: string, reason: ReportReason): Promise<{ ok: boolean; hidden: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/api/cannon/reports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ takeId, anonKey: getAnonKey(), reason }),
    });
    if (res.ok) return (await res.json()) as { ok: boolean; hidden: boolean };
  } catch {
    /* offline — the local hide already happened optimistically */
  }
  return { ok: false, hidden: false };
}

// ── Gauge ────────────────────────────────────────────────────────────────────

export const GAUGE_EMPTY: GaugeSummary = {
  avg: null,
  count: 0,
  moods: { buzzing: 0, relieved: 0, anxious: 0, frustrated: 0 },
  mine: null,
};

export function fallbackGauge(): GaugeSummary {
  return readJSON<GaugeSummary>(GAUGE_CACHE) ?? GAUGE_EMPTY;
}

export async function fetchGauge(matchId: string): Promise<{ gauge: GaugeSummary; online: boolean }> {
  try {
    const res = await fetch(
      `${API_BASE}/api/cannon/gauge?match=${matchId}&anonKey=${getAnonKey()}`,
      { cache: 'no-store' },
    );
    if (res.ok) {
      const body = (await res.json()) as GaugeSummary;
      if (typeof body.count === 'number') {
        writeJSON(GAUGE_CACHE, body);
        return { gauge: body, online: true };
      }
    }
  } catch {
    /* offline */
  }
  return { gauge: fallbackGauge(), online: false };
}

export async function postGauge(
  matchId: string,
  patch: { rating?: number | null; mood?: Mood | null; moment?: string | null },
): Promise<GaugeSummary | null> {
  try {
    const res = await fetch(`${API_BASE}/api/cannon/gauge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matchId, anonKey: getAnonKey(), ...patch }),
    });
    if (res.ok) {
      const body = (await res.json()) as GaugeSummary;
      writeJSON(GAUGE_CACHE, body);
      return body;
    }
  } catch {
    /* offline — optimistic state stands */
  }
  return null;
}

// ── Predictions ──────────────────────────────────────────────────────────────

export const PREDICTION_EMPTY: PredictionSummary = {
  counts: { W: 0, D: 0, L: 0 },
  total: 0,
  confidence: null,
  mine: null,
};

export function fallbackPrediction(): PredictionSummary {
  return readJSON<PredictionSummary>(PREDICT_CACHE) ?? PREDICTION_EMPTY;
}

export async function fetchPrediction(matchId: string): Promise<{ prediction: PredictionSummary; online: boolean }> {
  try {
    const res = await fetch(
      `${API_BASE}/api/cannon/predictions?match=${matchId}&anonKey=${getAnonKey()}`,
      { cache: 'no-store' },
    );
    if (res.ok) {
      const body = (await res.json()) as PredictionSummary;
      if (body && typeof body.total === 'number') {
        writeJSON(PREDICT_CACHE, body);
        return { prediction: body, online: true };
      }
    }
  } catch {
    /* offline */
  }
  return { prediction: fallbackPrediction(), online: false };
}

export async function postPrediction(
  matchId: string,
  pick: PredictionPick | null,
): Promise<PredictionSummary | null> {
  try {
    const res = await fetch(`${API_BASE}/api/cannon/predictions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matchId, anonKey: getAnonKey(), pick }),
    });
    if (res.ok) {
      const body = (await res.json()) as PredictionSummary;
      writeJSON(PREDICT_CACHE, body);
      return body;
    }
  } catch {
    /* offline — optimistic state stands */
  }
  return null;
}
