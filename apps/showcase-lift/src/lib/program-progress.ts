/**
 * Program progress — a tiny localStorage ledger.
 *
 * Two facts live here, on-device only:
 *   - how many sessions of each program you've completed (the monotonic
 *     counter that drives missed-session recovery), and
 *   - which program session is currently "live" (so live mode can show the
 *     week banner + scale loads, and the finish flow can advance the count).
 *
 * Kept out of the DB on purpose: it's lightweight pointer state, not
 * canonical training history, and it should survive a schema reset.
 */

const COMPLETED_PREFIX = 'shippie:lift:program-completed:';
const ACTIVE_KEY = 'shippie:lift:active-program';

export interface ActiveProgram {
  programId: string;
  programName: string;
  weekIndex: number;
  dayIndex: number;
  weekLabel: string;
  loadPct: number;
  isDeload: boolean;
}

export function getCompletedCount(programId: string): number {
  try {
    const raw = localStorage.getItem(COMPLETED_PREFIX + programId);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function incrementCompleted(programId: string): void {
  try {
    localStorage.setItem(COMPLETED_PREFIX + programId, String(getCompletedCount(programId) + 1));
  } catch {
    // best-effort
  }
}

export function getActiveProgram(): ActiveProgram | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    return raw ? (JSON.parse(raw) as ActiveProgram) : null;
  } catch {
    return null;
  }
}

export function setActiveProgram(ctx: ActiveProgram | null): void {
  try {
    if (ctx) localStorage.setItem(ACTIVE_KEY, JSON.stringify(ctx));
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // best-effort
  }
}
