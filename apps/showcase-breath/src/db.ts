/**
 * Breath persistence — completed sessions. Tiny rows, localStorage.
 */
const STORAGE_KEY = 'shippie.breath.v1';

import type { PatternId } from './patterns.ts';

export interface Session {
  id: string;
  pattern: PatternId;
  rounds: number;
  duration_seconds: number;
  completed_at: string;
}

interface Persisted {
  sessions: Session[];
}

export function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sessions: [] };
    const parsed = JSON.parse(raw) as Persisted;
    return { sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [] };
  } catch {
    return { sessions: [] };
  }
}

export function save(state: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* best-effort */
  }
}

export function newId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
