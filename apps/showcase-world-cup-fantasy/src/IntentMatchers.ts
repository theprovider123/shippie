/**
 * Cross-app intent matchers for the World Cup Fantasy elevation.
 *
 * Per spec §7.6 + Brief D, Match Room broadcasts `match.kickoff-soon`
 * and we surface a "Kickoff in 10 minutes — your captain plays" banner.
 * Because the rest of the monorepo emits hyphenated intent kinds today
 * (`kickoff-soon`, `match.kickoff-soon`), we register both forms so a
 * future schema migration is non-breaking. The toast pipeline rides on
 * `<IntentToastHost>` from `@shippie/showcase-kit-v2`.
 */
import type { IntentLike, IntentMatcher, ToastSpec } from '@shippie/showcase-kit-v2';

export interface KickoffSoonPayload {
  fixture?: string;
  minutesUntil?: number;
  captainName?: string;
}

function readKickoffPayload(intent: IntentLike): KickoffSoonPayload {
  const rows = (intent.payload as { rows?: unknown[] } | undefined)?.rows;
  const first = Array.isArray(rows) ? rows[0] : intent.payload;
  if (first && typeof first === 'object') {
    return first as KickoffSoonPayload;
  }
  return {};
}

function kickoffToast(intent: IntentLike): ToastSpec {
  const payload = readKickoffPayload(intent);
  const fixture = payload.fixture ?? 'the match';
  const minutes = typeof payload.minutesUntil === 'number' ? payload.minutesUntil : 10;
  const captain = payload.captainName;
  return {
    title: `Kickoff in ${minutes} minutes`,
    body: captain ? `Your captain ${captain} plays — ${fixture}.` : `Your captain plays — ${fixture}.`,
    icon: '⏱',
  };
}

export const MATCHERS: IntentMatcher[] = [
  { kind: 'match.kickoff-soon', toast: kickoffToast, throttleMs: 60_000 },
  { kind: 'kickoff-soon',       toast: kickoffToast, throttleMs: 60_000 },
];

export const MATCHED_KINDS: readonly string[] = MATCHERS.map((m) => m.kind);

/** Test helper — build a ToastSpec from a kind without the live host. */
export function specForKind(kind: string, payload: KickoffSoonPayload = {}): ToastSpec | null {
  const matcher = MATCHERS.find((m) => m.kind === kind);
  if (!matcher) return null;
  return matcher.toast({ kind, payload: { rows: [payload] } });
}
