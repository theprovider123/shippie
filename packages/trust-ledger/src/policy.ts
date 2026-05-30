/**
 * Failure policy for the durable-commit invariant.
 *
 * The bridge wrapper calls `classifyFailure(...)` before deciding
 * whether to post the original result or a `ledger-unavailable` error
 * response. See `docs/superpowers/specs/2026-05-30-trust-ledger-5a-design.md`
 * §7 for the spec-frozen allow-list.
 */

export type LedgerFailureKind =
  | 'idb-transient'
  | 'idb-quota'
  | 'crypto'
  | 'key-unavailable'
  | 'pre-init-overflow'
  | 'unknown';

export type FailurePolicyDecision =
  | { mode: 'fail-closed'; errorCode: 'ledger-unavailable' | 'key-unavailable'; safeModeHint: boolean }
  | { mode: 'fail-open-degraded'; queueRetry: true };

/**
 * Capabilities that may complete on ledger-commit failure. Frozen at
 * spec time. Anything not in this set fails closed.
 *
 * The list is deliberately narrow: pure introspective reads with no
 * outbound traffic. `intent.consume` is included because the consumer
 * is reading from a cache or already-broadcast payload — no fresh
 * provider invocation is triggered by a consume.
 */
export const FAIL_OPEN_CAPABILITIES: ReadonlySet<string> = new Set([
  'db.query',
  'db.list',
  'storage.getUsage',
  'apps.list',
  'agent.insights',
]);

/**
 * Capabilities that may fail-open *only* when their payload meets a
 * narrow predicate. The predicate must return true for fail-open to
 * apply; otherwise the call fails closed.
 *
 * Keeping these separate from the always-fail-open set makes the
 * policy auditable: the spec lists exactly which capabilities relax
 * the durable-commit invariant and under what conditions.
 */
export const CONDITIONAL_FAIL_OPEN: ReadonlyMap<string, (payload: unknown) => boolean> = new Map([
  // ai.run with explicit local-only flag and no egress request.
  [
    'ai.run',
    (payload) => {
      if (!payload || typeof payload !== 'object') return false;
      const p = payload as Record<string, unknown>;
      const egress = p.egress;
      return egress === false || egress === undefined;
    },
  ],
  // intent.consume is a read — no fresh provider invocation, no
  // outbound data leaves the device.
  ['intent.consume', () => true],
]);

export interface ClassifyInput {
  capability: string;
  payload: unknown;
  failure: LedgerFailureKind;
}

export function classifyFailure(input: ClassifyInput): FailurePolicyDecision {
  if (input.failure === 'key-unavailable') {
    return { mode: 'fail-closed', errorCode: 'key-unavailable', safeModeHint: true };
  }
  if (input.failure === 'crypto') {
    return { mode: 'fail-closed', errorCode: 'ledger-unavailable', safeModeHint: true };
  }

  if (FAIL_OPEN_CAPABILITIES.has(input.capability)) {
    return { mode: 'fail-open-degraded', queueRetry: true };
  }
  const conditional = CONDITIONAL_FAIL_OPEN.get(input.capability);
  if (conditional && conditional(input.payload)) {
    return { mode: 'fail-open-degraded', queueRetry: true };
  }

  return { mode: 'fail-closed', errorCode: 'ledger-unavailable', safeModeHint: input.failure === 'pre-init-overflow' };
}

/**
 * Stuck-loop guard. The bridge calls `recordFailureForApp(...)` for
 * every fail-closed response; when 5 fail-closed responses arrive
 * inside 60 s for the same app, the guard fires and the container
 * forces the failure banner to a modal that requires acknowledgement.
 */
export interface StuckLoopGuardOptions {
  threshold?: number; // default 5
  windowMs?: number; // default 60_000
  now?: () => number;
}

export function createStuckLoopGuard(opts: StuckLoopGuardOptions = {}): {
  recordFailureForApp: (app: string) => boolean;
  reset: (app?: string) => void;
} {
  const threshold = opts.threshold ?? 5;
  const windowMs = opts.windowMs ?? 60_000;
  const now = opts.now ?? Date.now;
  const failures = new Map<string, number[]>();

  return {
    recordFailureForApp(app: string): boolean {
      const t = now();
      const cutoff = t - windowMs;
      const arr = failures.get(app) ?? [];
      while (arr.length > 0 && arr[0]! < cutoff) arr.shift();
      arr.push(t);
      failures.set(app, arr);
      return arr.length >= threshold;
    },
    reset(app?: string): void {
      if (app === undefined) failures.clear();
      else failures.delete(app);
    },
  };
}
