// packages/sdk/src/wrapper/whispers.ts
/**
 * Whispers — Phase 6.4 of the master plan.
 *
 * One-way messages from the maker to their app's users. Bundled with
 * the deploy (no push infrastructure). Show-once on next app open,
 * dismissible, optionally tied to a route action ("Filtering by
 * cooking time is live! Tap Search to try it.").
 *
 * Architectural choice: a Whisper is just a static field on the deploy
 * (declared in shippie.json). The wrapper diffs the latest deploy's
 * whisper against what the user has already dismissed (in localStorage)
 * and renders if new. Zero server-side push, zero notification permission.
 *
 * The codec defines the schema and validates declarations. Same
 * allowlist + per-rule sanitization as feedback / analytics.
 */

export const ALLOWED_WHISPER_FIELDS = [
  'id',
  'message',
  'action',
  'showOnce',
  'expiresAfter',
] as const;

export interface Whisper {
  /** Stable id chosen by the maker. The wrapper uses it for dismissal
   *  bookkeeping — same id across deploys = same Whisper from the
   *  user's perspective. */
  id: string;
  /** Message body. Markdown-naive — plain text rendered in the toast. */
  message: string;
  /** Optional in-app route to navigate to when the user taps the action
   *  link. Must be a parameterized or static route — never a full URL. */
  action?: string;
  /** Default true — Whisper hides forever once dismissed. False means
   *  it re-shows every visit until expiresAfter passes. */
  showOnce?: boolean;
  /** ISO duration like '7d' or '24h'. After this period the Whisper
   *  stops being shown regardless of dismissal state. */
  expiresAfter?: string;
}

const WHISPER_ID_RE = /^[a-z0-9][a-z0-9_-]{0,40}$/i;
const MAX_MESSAGE_LEN = 280;
const EXPIRES_RE = /^([1-9][0-9]{0,3})(d|h|m)$/;
const ROUTE_SEGMENT_RE = /^[a-z][a-z0-9_-]{0,40}$/i;
const ROUTE_PLACEHOLDER_RE = /^:[a-z][a-z0-9_]{0,40}$/i;

function sanitizeRoute(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (value.length > 128) return undefined;
  if (value.includes('?') || value.includes('#')) return undefined;
  if (value === '/') return value;
  if (!value.startsWith('/')) return undefined;
  const stripped = value.endsWith('/') && value.length > 1 ? value.slice(0, -1) : value;
  const segments = stripped.split('/').slice(1);
  if (segments.length === 0) return undefined;
  let hasPlaceholder = false;
  for (const seg of segments) {
    if (ROUTE_PLACEHOLDER_RE.test(seg)) {
      hasPlaceholder = true;
      continue;
    }
    if (!ROUTE_SEGMENT_RE.test(seg)) return undefined;
  }
  // Whisper actions usually point at a section page like /search; we
  // accept the same form as analytics page keys.
  if (segments.length > 1 && !hasPlaceholder) return undefined;
  return value;
}

/**
 * Validate + normalize a Whisper declaration from a maker's
 * shippie.json. Returns null when the declaration is invalid or
 * missing — the wrapper UI then shows nothing rather than rendering a
 * broken toast.
 */
export function buildWhisper(raw: unknown): Whisper | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || !WHISPER_ID_RE.test(obj.id)) return null;
  if (typeof obj.message !== 'string') return null;
  const message = obj.message.trim();
  if (message.length === 0 || message.length > MAX_MESSAGE_LEN) return null;

  const result: Whisper = {
    id: obj.id,
    message,
  };
  const action = sanitizeRoute(obj.action);
  if (action !== undefined) result.action = action;
  if (typeof obj.showOnce === 'boolean') result.showOnce = obj.showOnce;
  if (typeof obj.expiresAfter === 'string' && EXPIRES_RE.test(obj.expiresAfter)) {
    result.expiresAfter = obj.expiresAfter;
  }
  return result;
}

/**
 * Convert an `expiresAfter` string ('7d', '24h', '30m') to milliseconds.
 * Returns null on bad input. Pure — used by the dismiss bookkeeper.
 */
export function expiresAfterMs(value: string): number | null {
  const m = EXPIRES_RE.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2];
  if (!Number.isFinite(n)) return null;
  if (unit === 'd') return n * 24 * 60 * 60 * 1000;
  if (unit === 'h') return n * 60 * 60 * 1000;
  if (unit === 'm') return n * 60 * 1000;
  return null;
}

export interface WhisperDismissalState {
  /** Whisper id → ISO timestamp when dismissed. */
  dismissed: Record<string, string>;
}

/**
 * Should we show this Whisper now? Pure — caller passes the current
 * dismissal state from localStorage and the current time.
 *
 * Decision tree:
 *   - showOnce + dismissed within expiresAfter → no
 *   - showOnce + dismissed past expiresAfter   → yes (re-eligible)
 *   - showOnce + never dismissed               → yes
 *   - !showOnce + dismissed within expiresAfter → no (sticky for window)
 *   - !showOnce + outside any expiresAfter     → yes every time
 */
export function shouldShowWhisper(
  whisper: Whisper,
  state: WhisperDismissalState,
  nowIso: string,
): boolean {
  const dismissedAt = state.dismissed[whisper.id];
  if (!dismissedAt) return true;
  const dismissedMs = Date.parse(dismissedAt);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(dismissedMs) || !Number.isFinite(now)) return true;
  if (!whisper.expiresAfter) {
    // No expiry declared. showOnce default true → never re-show.
    if (whisper.showOnce !== false) return false;
    return true;
  }
  const ttl = expiresAfterMs(whisper.expiresAfter);
  if (ttl === null) return whisper.showOnce !== false ? false : true;
  return now > dismissedMs + ttl;
}

/**
 * Read a Whisper from a normalized shippie.json blob. Returns null if
 * the manifest doesn't declare one.
 */
export function readWhisperFromManifest(
  manifest: { whisper?: unknown } | null | undefined,
): Whisper | null {
  if (!manifest || typeof manifest !== 'object') return null;
  const w = (manifest as { whisper?: unknown }).whisper;
  return buildWhisper(w);
}
