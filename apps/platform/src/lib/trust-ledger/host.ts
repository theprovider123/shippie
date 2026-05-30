/**
 * Platform-side Trust Ledger host.
 *
 * Singleton resolver for the on-device Ledger instance plus the helper
 * that turns BridgeLedgerEvents into committed rows. Used by the
 * container's bridge construction to satisfy the durable-commit
 * invariant from spec §6.
 *
 * SSR-safe: `getLedger()` resolves to null in environments without
 * `globalThis.indexedDB`. Callers (including `onCommitLedger`) skip
 * commit when null, since SSR responses do not represent real user
 * activity.
 */

import {
  BridgeRpcError,
  type BridgeHandler,
  type BridgeHandlerContext,
  type BridgeLedgerEvent,
} from '@shippie/container-bridge';
import {
  classifyFailure,
  createLedger,
  createStuckLoopGuard,
  deriveDeviceLedgerKey,
  getOrCreateDeviceSeed,
  openRevocationStore,
  redactCapabilityCall,
  ulid,
  type Ledger,
  type LedgerRow,
  type RevocationStore,
} from '@shippie/trust-ledger';
import type { BridgeCapability } from '@shippie/app-package-contract';

let ledgerPromise: Promise<Ledger | null> | null = null;
let revocationStorePromise: Promise<RevocationStore | null> | null = null;
const stuckLoopGuard = createStuckLoopGuard();

/**
 * Resolve the per-device Ledger instance. Returns null in environments
 * without IndexedDB (SSR, some test runners). Caches the promise so
 * concurrent callers share the same init.
 */
export function getLedger(): Promise<Ledger | null> {
  if (ledgerPromise) return ledgerPromise;
  if (typeof globalThis === 'undefined' || !globalThis.indexedDB) {
    ledgerPromise = Promise.resolve(null);
    return ledgerPromise;
  }
  ledgerPromise = (async () => {
    try {
      const seed = await getOrCreateDeviceSeed();
      const key = await deriveDeviceLedgerKey(seed);
      return await createLedger({ key });
    } catch (err) {
      // Initialisation failure is recoverable — surface as null so the
      // bridge fails closed per the spec failure policy, and the
      // user-visible banner can fire.
      console.warn('[trust-ledger] init failed', err);
      return null;
    }
  })();
  return ledgerPromise;
}

/**
 * Resolve the per-device RevocationStore. Returns null in environments
 * without IndexedDB.
 */
export function getRevocationStore(): Promise<RevocationStore | null> {
  if (revocationStorePromise) return revocationStorePromise;
  if (typeof globalThis === 'undefined' || !globalThis.indexedDB) {
    revocationStorePromise = Promise.resolve(null);
    return revocationStorePromise;
  }
  revocationStorePromise = (async () => {
    try {
      return await openRevocationStore();
    } catch (err) {
      console.warn('[trust-ledger] revocation store init failed', err);
      return null;
    }
  })();
  return revocationStorePromise;
}

/**
 * Reset cached state. Test-only.
 */
export function _resetLedgerHost(): void {
  ledgerPromise = null;
  revocationStorePromise = null;
  stuckLoopGuard.reset();
}

/**
 * Wrap a bridge handler map so each capability call first consults
 * the per-device revocation store. A revoked (app, capability) pair
 * throws a `capability_revoked` BridgeRpcError which propagates as a
 * standard denied response — and the denial is logged as a ledger row
 * by the existing onCommitLedger path.
 *
 * `appSlug` is the user-facing slug recorded in revocations. The bridge
 * receives `appId` (internal); the resolver maps appId → appSlug so
 * the revocation key matches what the Trust Center wrote.
 */
export function withRevocationGate(
  handlers: Partial<Record<BridgeCapability, BridgeHandler>>,
  appSlug: string,
): Partial<Record<BridgeCapability, BridgeHandler>> {
  const wrapped: Partial<Record<BridgeCapability, BridgeHandler>> = {};
  for (const [capability, handler] of Object.entries(handlers) as Array<[
    BridgeCapability,
    BridgeHandler | undefined,
  ]>) {
    if (!handler) continue;
    wrapped[capability] = async (context: BridgeHandlerContext) => {
      const store = await getRevocationStore();
      if (store && (await store.isRevoked(appSlug, capability))) {
        throw new BridgeRpcError(
          'Capability has been revoked by the user for this app.',
          'capability_revoked',
        );
      }
      return handler(context);
    };
  }
  return wrapped;
}

export interface AppLedgerContext {
  appSlug: string;
  egressVisibility: 'full' | 'bridge-only';
}

export interface BridgeEmitContext {
  /** Resolve the app context for a given appId. */
  resolveApp: (appId: string) => AppLedgerContext | null;
  /** Inject for tests; defaults to getLedger(). */
  ledger?: Ledger | null;
}

/**
 * Build a ledger row for a bridge event and commit it.
 *
 * Throws a BridgeRpcError when the failure policy demands fail-closed,
 * which the bridge host catches and converts into a fail-closed
 * response per spec §6 / §7.
 */
export async function emitBridgeLedgerRow(
  event: BridgeLedgerEvent,
  ctx: BridgeEmitContext,
): Promise<void> {
  const ledger = ctx.ledger ?? (await getLedger());

  const appCtx = ctx.resolveApp(event.request.appId);
  const appSlug = appCtx?.appSlug ?? event.request.appId;

  if (!ledger) {
    handleCommitFailure(event, 'key-unavailable', appSlug);
    return;
  }

  const redacted = redactCapabilityCall(event.capability, event.payload, event.result);
  const outcomeMap: Record<BridgeLedgerEvent['outcome'], LedgerRow['outcome']> = {
    ok: 'ok',
    denied: 'denied',
    handler_error: 'fail-closed',
  };

  const row: LedgerRow = {
    id: ulid(),
    ts: Date.now(),
    app: appSlug,
    capability: event.capability,
    category: 'capability',
    summary: redacted.summary,
    target_host: redacted.target_host,
    bytes_in: redacted.bytes_in,
    bytes_out: redacted.bytes_out,
    egress_visibility: appCtx?.egressVisibility,
    outcome: outcomeMap[event.outcome],
  };

  try {
    await ledger.commit(row);
  } catch (err) {
    handleCommitFailure(event, classifyCommitError(err), appSlug);
  }
}

function classifyCommitError(err: unknown): Parameters<typeof classifyFailure>[0]['failure'] {
  if (!err) return 'unknown';
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (message.includes('quota')) return 'idb-quota';
  if (message.includes('decrypt') || message.includes('encrypt') || message.includes('crypto')) {
    return 'crypto';
  }
  if (message.includes('seed') || message.includes('key')) return 'key-unavailable';
  return 'idb-transient';
}

function handleCommitFailure(
  event: BridgeLedgerEvent,
  failure: Parameters<typeof classifyFailure>[0]['failure'],
  appSlug: string,
): void {
  const decision = classifyFailure({
    capability: event.capability,
    payload: event.payload,
    failure,
  });

  if (decision.mode === 'fail-open-degraded') {
    // The bridge host posts the original response; nothing to throw.
    // 5B will land a queue to retry the commit on the next successful
    // ledger init. For 5A we accept the gap and emit a debug warn.
    if (typeof console !== 'undefined') {
      console.warn('[trust-ledger] commit fail-open-degraded', {
        capability: event.capability,
        failure,
      });
    }
    return;
  }

  const stuck = stuckLoopGuard.recordFailureForApp(appSlug);
  const baseMessage = decision.safeModeHint
    ? `Trust Ledger could not record this action — open Safe Mode to investigate.`
    : `Trust Ledger could not record this action — paused for safety.`;
  const message = stuck
    ? `${baseMessage} Open Settings → Trust Ledger to acknowledge.`
    : baseMessage;
  throw new BridgeRpcError(message, decision.errorCode);
}
