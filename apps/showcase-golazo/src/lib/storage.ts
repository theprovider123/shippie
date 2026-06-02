// On-device persistence. localStorage only — no account, no server, survives
// offline and reloads. All keys namespaced under `golazo:`.

import type { Pool, Prediction, Profile, Results } from "./types";
import type { Sweep } from "./sweeps";
import type { ScoreEntry } from "./games";
import { SCHEMA_VERSION } from "./types";

const K = {
  profile: "golazo:profile",
  prediction: "golazo:prediction",
  pools: "golazo:pools",
  results: "golazo:results",
  sweeps: "golazo:sweeps",
  scores: "golazo:scores",
} as const;

export function loadScores(): ScoreEntry[] {
  return read<ScoreEntry[]>(K.scores, []);
}
export function saveScores(scores: ScoreEntry[]): void {
  write(K.scores, scores);
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota — app still works in-memory for the session */
  }
}

// ── Profile ──
export function loadProfile(): Profile | null {
  return read<Profile | null>(K.profile, null);
}
export function saveProfile(p: Profile): void {
  write(K.profile, p);
}

// ── Prediction ──
export function emptyPrediction(): Prediction {
  return { v: SCHEMA_VERSION, groups: {}, knockout: {}, createdAt: Date.now() };
}
export function loadPrediction(): Prediction {
  return read<Prediction>(K.prediction, emptyPrediction());
}
export function savePrediction(p: Prediction): void {
  write(K.prediction, p);
}

// ── Pools ──
export function loadPools(): Pool[] {
  return read<Pool[]>(K.pools, []);
}
export function savePools(pools: Pool[]): void {
  write(K.pools, pools);
}

// ── Results (official; usually seeded/synced, can be manually entered) ──
export function loadResults(): Results {
  return read<Results>(K.results, { groups: {}, knockout: {} });
}
export function saveResults(r: Results): void {
  write(K.results, r);
}

// ── Sweepstakes ──
export function loadSweeps(): Sweep[] {
  return read<Sweep[]>(K.sweeps, []);
}
export function saveSweeps(sweeps: Sweep[]): void {
  write(K.sweeps, sweeps);
}

/** Short, friendly, uppercase pool/uid codes. Avoids ambiguous chars. */
export function makeCode(len = 5): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const rand = new Uint32Array(len);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(rand);
    for (let i = 0; i < len; i++) out += alphabet[rand[i] % alphabet.length];
  } else {
    for (let i = 0; i < len; i++)
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
