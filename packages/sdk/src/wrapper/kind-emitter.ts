/**
 * Wrapper-side emission of App Kinds proof events
 * (docs/app-kinds.md → "Local proof — the rules").
 *
 * The wrapper observes 5 conditions and emits them through the existing
 * proof emitter (`./proof.ts`). The platform's cron rollup
 * (apps/platform/src/lib/server/cron/kind-rollup.ts) consumes these to
 * upgrade `publicKindStatus` from `estimated` → `verifying` → `confirmed`,
 * or to demote a Local app on a personal-data leak.
 *
 *  1. `kind_local_launch_offline`
 *      Auto: emitted when the wrapper boots while `navigator.onLine === false`.
 *  2. `kind_local_write_local`
 *      Explicit: Shippie SDK subsystems (local-db, local-files) call
 *      `noteLocalWrite()` when they persist data on-device. The maker
 *      doesn't have to instrument anything — the SDK hooks already cover
 *      the canonical local-storage paths.
 *  3. `kind_local_workflow_offline`
 *      Auto: maker declares workflow probes in shippie.json
 *      (`workflow_probes`). The wrapper listens for matches via
 *      History API navigation + click and fires the event when a probe
 *      resolves while offline.
 *  4. `kind_connected_graceful_degrade`
 *      Explicit: app calls `noteGracefulDegrade(host)` when it caught a
 *      failed external fetch and rendered a sensible offline-state.
 *  5. `kind_leak_personal_data`
 *      Auto + explicit: the wrapper monkey-patches `fetch` lightly to
 *      detect outbound writes (POST/PUT/PATCH) to undeclared hosts with
 *      a non-trivial body. False positives are possible — this event
 *      only DEMOTES a Local detection, never promotes anything, so the
 *      cost of a false positive is "asks maker to confirm Connected"
 *      not "leaks user data".
 *
 * Wrapper auto-installation lives in `bootstrapObserve` /
 * `startInstallRuntime`; for now this module exposes a `configure` +
 * helpers so the wrapper bundle can opt in.
 */
import { emitProofEvent } from './proof.ts';

export interface KindEmitterConfig {
  /** From shippie.json `workflow_probes` — matched against the URL path. */
  workflowProbes?: string[];
  /** Hosts the maker declared as legitimate external feature data
   *  (allowed_connect_domains in shippie.json). Outbound traffic to
   *  these hosts is allowed without triggering a leak event. */
  allowedHosts?: string[];
  /** Override navigator for tests. */
  navigatorOverride?: { onLine: boolean };
  /** Hook fetch on this object instead of globalThis (tests). */
  fetchHost?: { fetch: typeof fetch };
}

let config: KindEmitterConfig | null = null;

/**
 * Initialise auto-emission. Idempotent. Safe to call twice; the second
 * call updates probe + allowed-host config without re-binding listeners.
 */
export function configureKindEmitter(opts: KindEmitterConfig = {}): void {
  const isFirstCall = config === null;
  config = opts;
  if (!isFirstCall) return;

  const nav =
    opts.navigatorOverride ??
    (typeof navigator !== 'undefined' ? navigator : null);

  // 1. kind_local_launch_offline — fired once at boot if offline.
  if (nav && nav.onLine === false) {
    emitProofEvent('kind_local_launch_offline');
  }

  // 3. kind_local_workflow_offline — observe URL transitions while offline.
  bindWorkflowProbes(nav);

  // 5. kind_leak_personal_data — soft fetch hook.
  bindLeakDetector(opts);
}

function bindWorkflowProbes(
  nav: { onLine: boolean } | null,
): void {
  if (typeof window === 'undefined' || !window.addEventListener) return;
  const fire = (url: string) => {
    const probes = config?.workflowProbes ?? [];
    if (probes.length === 0) return;
    if (!nav || nav.onLine !== false) return;
    if (probes.some((p) => urlMatchesProbe(url, p))) {
      emitProofEvent('kind_local_workflow_offline', { probe: url });
    }
  };
  // Initial path on boot.
  fire(window.location?.pathname ?? '');

  // Synthetic navigation event covers pushState/replaceState/popstate.
  window.addEventListener('shippie:navigate', (ev) => {
    const detail = (ev as CustomEvent<{ to?: string }>).detail;
    if (detail?.to) fire(detail.to);
  });
  window.addEventListener('popstate', () => fire(window.location.pathname));
}

function urlMatchesProbe(url: string, probe: string): boolean {
  if (!url || !probe) return false;
  // Probe is a path prefix or a full URL; we only look at the pathname.
  let pathname = url;
  try {
    pathname = new URL(url, 'http://x').pathname;
  } catch {
    /* relative path already */
  }
  if (probe.startsWith('/')) {
    return pathname === probe || pathname.startsWith(probe.endsWith('/') ? probe : probe + '/');
  }
  return pathname.includes(probe);
}

function bindLeakDetector(opts: KindEmitterConfig): void {
  // Note: only `fetchHost` is read from the first-call opts (the wrapper's
  // host is fixed once installed). All policy-shaped fields (allowedHosts,
  // workflowProbes) must be read from the live `config` module variable so
  // that subsequent configureKindEmitter() calls take effect.
  const host = opts.fetchHost ?? (typeof globalThis !== 'undefined' ? globalThis : null);
  if (!host || typeof host.fetch !== 'function') return;
  const original = host.fetch.bind(host);
  const wrapped = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = inputToUrl(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const allowedHosts = config?.allowedHosts ?? [];
      if (
        url &&
        isWriteMethod(method) &&
        isExternalUndeclared(url, allowedHosts) &&
        hasNonTrivialBody(init?.body)
      ) {
        emitProofEvent('kind_leak_personal_data', {
          host: new URL(url).host,
          method,
        });
      }
    } catch {
      // Detection is best-effort; a thrown URL parse must never break the
      // user's fetch call.
    }
    return original(input as RequestInfo, init);
  };
  // Preserve any extra properties (preconnect, etc.) on the original fetch
  // so the wrapped value still satisfies `typeof fetch` at the assignment.
  Object.assign(wrapped, original);
  host.fetch = wrapped as typeof fetch;
}

function inputToUrl(input: RequestInfo | URL): string | null {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (typeof input === 'object' && 'url' in input) return (input as Request).url;
  return null;
}

function isWriteMethod(m: string): boolean {
  return m === 'POST' || m === 'PUT' || m === 'PATCH';
}

const SHIPPIE_HOST_SUFFIXES = ['shippie.app', 'shippie.dev'];

function isShippieHost(host: string): boolean {
  for (const s of SHIPPIE_HOST_SUFFIXES) {
    if (host === s || host.endsWith('.' + s)) return true;
  }
  return false;
}

function isExternalUndeclared(url: string, allowed: string[]): boolean {
  let host: string;
  try {
    host = new URL(url, 'http://x').host;
  } catch {
    return false;
  }
  if (!host) return false; // relative URL — same-origin
  if (isShippieHost(host)) return false;
  // Same-origin to the page is also fine (most app traffic).
  if (typeof window !== 'undefined' && host === window.location?.host) return false;
  return !allowed.some((a) => host === a || host.endsWith('.' + a));
}

function hasNonTrivialBody(body: BodyInit | null | undefined): boolean {
  if (body === null || body === undefined) return false;
  if (typeof body === 'string') return body.length >= 8;
  if (body instanceof URLSearchParams) return body.toString().length >= 8;
  if (body instanceof FormData) {
    let count = 0;
    body.forEach(() => count++);
    return count > 0;
  }
  if (body instanceof Blob) return body.size >= 8;
  if (body instanceof ArrayBuffer) return body.byteLength >= 8;
  // Streams + typed arrays — assume non-trivial.
  return true;
}

// ---------------------------------------------------------------------------
// Explicit helpers — called by SDK subsystems and maker code where a
// runtime fact is best observed at the call site.
// ---------------------------------------------------------------------------

/** Local DB / files / OPFS write. Called by Shippie SDK persistence layers. */
export function noteLocalWrite(payload?: Record<string, unknown>): void {
  emitProofEvent('kind_local_write_local', payload);
}

/** Connected app handled an external-data failure with a sensible offline state. */
export function noteGracefulDegrade(host: string): void {
  emitProofEvent('kind_connected_graceful_degrade', { host });
}

/** Maker code (or a deeper detector) observed a personal-data leak. */
export function notePersonalDataLeak(host: string, method: string): void {
  emitProofEvent('kind_leak_personal_data', { host, method });
}

/** Reset state — exposed for tests only. */
export function _resetKindEmitterForTests(): void {
  config = null;
}
