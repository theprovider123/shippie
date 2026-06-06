// Tips lock when the first match kicks off. Before then we show a live countdown;
// after, the call is read-only. Pure + testable; the UI passes Date.now().

/** First match of the 2026 World Cup — tips lock at kick-off. */
export const TOURNAMENT_KICKOFF = "2026-06-11T16:00:00Z";
export const TOURNAMENT_KICKOFF_MS = Date.parse(TOURNAMENT_KICKOFF);

export interface Countdown {
  locked: boolean;
  /** "2d 14h 32m" before lock, "Tips in" once locked. */
  text: string;
}

export function lockCountdown(kickoffMs: number, nowMs: number): Countdown {
  const ms = kickoffMs - nowMs;
  if (ms <= 0) return { locked: true, text: "Tips in" };
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return { locked: false, text: `${days}d ${hours}h ${mins}m` };
  if (hours > 0) return { locked: false, text: `${hours}h ${mins}m` };
  return { locked: false, text: `${mins}m` };
}

/** Convenience: are tips locked right now? */
export function tipsLocked(nowMs: number): boolean {
  return nowMs >= TOURNAMENT_KICKOFF_MS;
}
