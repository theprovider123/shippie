// packages/sdk/src/wrapper/install-prompt.ts
/**
 * Engagement-gated install prompt state machine.
 *
 * Tiers:
 *   - 'none'  → no banner. Subtle nav pill only.
 *   - 'soft'  → 40px top banner, dismissible.
 *   - 'full'  → full-bleed sheet with 3-step guide.
 *
 * Rules (see spec §5.3):
 *   - Visit 1, dwell < 60s → none
 *   - Visit 1, dwell >= 60s → soft
 *   - Visit 2 → soft
 *   - Visit 3+ → full
 *   - Any meaningful action → full
 *   - Dismissed in last 14 days → none (overrides)
 */
const SAME_SESSION_MS = 30 * 60 * 1000; // 30 min
const DISMISSAL_COOLDOWN_MS = 14 * 86_400_000; // 14 days
const DWELL_FOR_SOFT_MS = 60_000; // 60 s

export type PromptTier = 'none' | 'soft' | 'full';

export interface PromptState {
  visit_count: number;
  first_visit_at: number;
  last_visit_at: number;
  /** Cumulative dwell time across all visits, in ms. Caller updates on visibilitychange. */
  dwell_ms: number;
  /** Deploy, install, feedback, rating — counted by the caller. */
  meaningful_actions: number;
  last_dismissed_at: number | null;
}

export function isDismissedRecently(state: PromptState, now: number): boolean {
  if (state.last_dismissed_at === null) return false;
  return now - state.last_dismissed_at < DISMISSAL_COOLDOWN_MS;
}

export function computePromptTier(state: PromptState, now: number): PromptTier {
  if (isDismissedRecently(state, now)) return 'none';
  if (state.meaningful_actions > 0) return 'full';
  if (state.visit_count >= 3) return 'full';
  if (state.visit_count >= 2) return 'soft';
  if (state.visit_count === 1 && state.dwell_ms >= DWELL_FOR_SOFT_MS) return 'soft';
  return 'none';
}

export function recordVisit(prev: PromptState | null, now: number): PromptState {
  if (!prev) {
    return {
      visit_count: 1,
      first_visit_at: now,
      last_visit_at: now,
      dwell_ms: 0,
      meaningful_actions: 0,
      last_dismissed_at: null,
    };
  }
  const inSameSession = now - prev.last_visit_at < SAME_SESSION_MS;
  return {
    ...prev,
    visit_count: inSameSession ? prev.visit_count : prev.visit_count + 1,
    last_visit_at: now,
  };
}

export function recordDismissal(prev: PromptState, now: number): PromptState {
  return { ...prev, last_dismissed_at: now };
}

export function recordMeaningfulAction(prev: PromptState): PromptState {
  return { ...prev, meaningful_actions: prev.meaningful_actions + 1 };
}

export function addDwell(prev: PromptState, delta_ms: number): PromptState {
  return { ...prev, dwell_ms: prev.dwell_ms + delta_ms };
}

/**
 * Serialize/deserialize for localStorage or a signed cookie.
 * Caller is responsible for persistence; this module is pure.
 */
export function serialize(state: PromptState): string {
  return JSON.stringify(state);
}

export function deserialize(raw: string | null): PromptState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PromptState>;
    if (
      typeof parsed.visit_count !== 'number' ||
      typeof parsed.first_visit_at !== 'number' ||
      typeof parsed.last_visit_at !== 'number' ||
      typeof parsed.dwell_ms !== 'number' ||
      typeof parsed.meaningful_actions !== 'number' ||
      (parsed.last_dismissed_at !== null && typeof parsed.last_dismissed_at !== 'number')
    ) {
      return null;
    }
    return parsed as PromptState;
  } catch {
    return null;
  }
}
