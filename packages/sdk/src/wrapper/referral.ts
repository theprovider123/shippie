// packages/sdk/src/wrapper/referral.ts
/**
 * Referral helpers — capture a `?ref=…` param and construct invite URLs.
 *
 * Flow:
 *   1. A user clicks a marketplace listing with `?ref=category-top-rated`.
 *   2. The wrapper reads the ref on page load and stashes it in
 *      localStorage under `shippie-referral-source`.
 *   3. When an install completes, the beacon includes `ref` so the
 *      platform can attribute the install to its source.
 */

const STORAGE_KEY = 'shippie-referral-source';
const DEFAULT_TTL_MS = 7 * 86_400_000;
const MAX_SOURCE_LEN = 64;

export interface CaptureOptions {
  /** Override the param name. Default: 'ref'. */
  paramName?: string;
  /** Max age the captured ref remains valid, ms. Default: 7 days. */
  ttlMs?: number;
}

export interface CapturedRef {
  source: string;
  capturedAt: number;
}

/**
 * Read `?ref=…` (or `opts.paramName`) from a URL. If present, persist
 * it in localStorage and return the record. If absent, fall back to the
 * stored record (respecting ttl). Malformed URLs return null.
 */
export function captureReferral(
  url: string,
  opts: CaptureOptions = {},
): CapturedRef | null {
  const param = opts.paramName ?? 'ref';
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  try {
    const u = new URL(url);
    const raw = u.searchParams.get(param);
    if (!raw) return readStoredReferral(ttl);
    const source = raw.trim().slice(0, MAX_SOURCE_LEN);
    if (!source) return readStoredReferral(ttl);
    const record: CapturedRef = { source, capturedAt: Date.now() };
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
      } catch {
        // storage full / blocked — ignore
      }
    }
    return record;
  } catch {
    return null;
  }
}

/**
 * Read the persisted referral record, evicting it if older than `ttlMs`.
 * Returns null if nothing is stored, storage is unavailable, or the
 * payload is malformed.
 */
export function readStoredReferral(ttlMs = DEFAULT_TTL_MS): CapturedRef | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CapturedRef>;
    if (typeof parsed.source !== 'string' || typeof parsed.capturedAt !== 'number') {
      return null;
    }
    if (Date.now() - parsed.capturedAt > ttlMs) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      return null;
    }
    return { source: parsed.source, capturedAt: parsed.capturedAt };
  } catch {
    return null;
  }
}

/** Clear the persisted referral record. Safe in non-browser contexts. */
export function clearReferral(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export interface InviteLinkOptions {
  baseUrl: string;
  source?: string;
  inviter?: string;
}

/**
 * Build an invite link by appending `?ref=source&by=inviter` to `baseUrl`.
 * Existing query params on `baseUrl` are preserved.
 */
export function buildInviteLink(opts: InviteLinkOptions): string {
  const u = new URL(opts.baseUrl);
  if (opts.source) u.searchParams.set('ref', opts.source);
  if (opts.inviter) u.searchParams.set('by', opts.inviter);
  return u.toString();
}
