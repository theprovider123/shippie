/**
 * Community data client for the Terrace and the Gauge. Online it talks to
 * the platform routes (/api/cannon/*); offline it degrades to the last-good
 * localStorage snapshot, then to the seeded launch takes — the golazo
 * feed.ts ladder. Writes are optimistic; the server is the tie-breaker on
 * the next successful fetch.
 */
import { SEED_TAKES } from '../data/takes-seed';
import { getAnonKey } from './handle';
import type { GaugeSummary, Mood, Take, Thread, VoteDir } from './types';

// Same-origin in production (the app document lives on shippie.app whether
// reached via cannon.shippie.app → /run/cannon or directly); the platform
// dev server in development.
const API_BASE = import.meta.env.DEV ? 'http://localhost:4101' : '';

const TAKES_CACHE = 'cannon_takes_cache';
const GAUGE_CACHE = 'cannon_gauge_cache';
const LOCAL_TAKES = 'cannon_local_takes';

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

export async function fetchTakes(): Promise<{ takes: Take[]; online: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/api/cannon/takes?anonKey=${getAnonKey()}`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const body = (await res.json()) as { takes: Take[] };
      if (Array.isArray(body.takes)) {
        writeJSON(TAKES_CACHE, body.takes);
        // Server now owns anything it returned; drop confirmed local copies.
        const serverTexts = new Set(body.takes.map((t) => `${t.handle}:${t.text}`));
        const pending = localTakes().filter((t) => !serverTexts.has(`${t.handle}:${t.text}`));
        writeJSON(LOCAL_TAKES, pending);
        return { takes: [...pending, ...body.takes], online: true };
      }
    }
  } catch {
    /* offline or blocked */
  }
  return { takes: fallbackTakes(), online: false };
}

/**
 * Persist a composed take. The caller shows `optimistic` instantly; this
 * trades it for the server's copy when online, or stores it for replay
 * when offline.
 */
export async function postTake(optimistic: Take): Promise<{ take: Take; online: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/api/cannon/takes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        handle: optimistic.handle,
        thread: optimistic.thread,
        text: optimistic.text,
        anonKey: getAnonKey(),
      }),
    });
    if (res.ok) {
      const body = (await res.json()) as { take: Take };
      return { take: body.take, online: true };
    }
  } catch {
    /* offline */
  }
  writeJSON(LOCAL_TAKES, [optimistic, ...localTakes()]);
  return { take: optimistic, online: false };
}

export function buildTake(handle: string, thread: Thread, text: string): Take {
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    handle,
    thread,
    text,
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

export const GAUGE_FALLBACK: GaugeSummary = {
  avg: 7.4,
  count: 14832,
  moods: { buzzing: 38, relieved: 29, anxious: 22, frustrated: 11 },
  mine: null,
};

export function fallbackGauge(): GaugeSummary {
  return readJSON<GaugeSummary>(GAUGE_CACHE) ?? GAUGE_FALLBACK;
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
