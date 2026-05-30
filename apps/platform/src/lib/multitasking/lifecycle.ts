/**
 * App lifecycle (Tranche 1).
 *
 * Formal states for showcase iframes mounted in the container:
 *   - running    — iframe focused and active
 *   - paused     — iframe mounted but not focused (other app on top)
 *   - suspended  — iframe unmounted; last state snapshot in OPFS for
 *                  resume on next mount
 *   - evicted    — LRU-evicted; resume forces a cold reload
 *
 * 5A foundation for Tranche 1: pure state machine + transition table.
 * The wiring into AppFrameHost / iframe LRU + the OPFS state snapshot
 * follows as separate patches. The state machine here is the truth
 * source so callers cannot mint invalid transitions.
 */

export type LifecycleState = 'running' | 'paused' | 'suspended' | 'evicted';

export type LifecycleEvent = 'focus' | 'blur' | 'snapshot' | 'evict' | 'restore';

const TRANSITIONS: Record<LifecycleState, Partial<Record<LifecycleEvent, LifecycleState>>> = {
  running: {
    blur: 'paused',
    snapshot: 'suspended',
  },
  paused: {
    focus: 'running',
    snapshot: 'suspended',
    evict: 'evicted',
  },
  suspended: {
    restore: 'paused',
    evict: 'evicted',
  },
  evicted: {
    restore: 'running',
  },
};

export function next(state: LifecycleState, event: LifecycleEvent): LifecycleState {
  const candidate = TRANSITIONS[state]?.[event];
  if (!candidate) {
    throw new Error(`lifecycle: invalid transition ${state} --${event}-->`);
  }
  return candidate;
}

export function canTransition(state: LifecycleState, event: LifecycleEvent): boolean {
  return TRANSITIONS[state]?.[event] !== undefined;
}

/**
 * Snapshot envelope persisted to OPFS so a suspended showcase can
 * resume with scroll position, route, and form state intact.
 *
 * The actual snapshot writer/reader lives alongside `@shippie/local-files`
 * in a follow-up patch; this type is the contract.
 */
export interface AppStateSnapshot {
  appSlug: string;
  capturedAt: number;
  /** Last known route in the iframe. */
  route?: string;
  /** Free-form per-app key/value state. */
  state?: Record<string, unknown>;
  schemaVersion: 1;
}

/**
 * Background task contract (Tranche 1, narrow capability).
 *
 * `budgetMs` is best-effort: in browsers that allow background
 * execution (Periodic Background Sync, Background Fetch, Notification
 * Triggers) the timer runs even with the tab hidden; everywhere else
 * the host commits to faithful resume on next foreground, capped at
 * `budgetMs` of wall-clock from the original grant.
 */
export interface BackgroundTaskRequest {
  appSlug: string;
  taskName: string;
  budgetMs: number;
}

export interface BackgroundTaskGrant {
  appSlug: string;
  taskName: string;
  grantedAt: number;
  expiresAt: number;
}

/**
 * Spec-frozen ceiling: a single named task may not request more than
 * 5 minutes of best-effort background budget. Audio playback uses a
 * separate primitive (HTMLMediaElement) so this cap does not apply to
 * music/podcast playback.
 */
export const MAX_BACKGROUND_BUDGET_MS = 5 * 60 * 1000;

export function grantBackgroundTask(
  req: BackgroundTaskRequest,
  now: number = Date.now(),
): BackgroundTaskGrant {
  if (req.budgetMs <= 0) {
    throw new RangeError('lifecycle: budgetMs must be > 0');
  }
  if (req.budgetMs > MAX_BACKGROUND_BUDGET_MS) {
    throw new RangeError(`lifecycle: budgetMs exceeds ${MAX_BACKGROUND_BUDGET_MS} ms cap`);
  }
  return {
    appSlug: req.appSlug,
    taskName: req.taskName,
    grantedAt: now,
    expiresAt: now + req.budgetMs,
  };
}

export function isGrantExpired(grant: BackgroundTaskGrant, now: number = Date.now()): boolean {
  return now >= grant.expiresAt;
}
