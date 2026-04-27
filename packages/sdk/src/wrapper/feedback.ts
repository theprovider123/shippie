// packages/sdk/src/wrapper/feedback.ts
/**
 * Anonymous feedback codec — Phase 6.3.
 *
 * Same enforcement model as analytics: a strict allowlist with a
 * field-by-field copy. Anything not allowlisted is dropped at
 * serialization regardless of input shape.
 *
 * Allowed fields on a feedback payload:
 *   - threadId        — opaque uuid for the thread (caller-generated)
 *   - appSlug         — the app this feedback belongs to
 *   - kind            — idea | bug | chat | love
 *   - message         — the maker-visible text. Bounded length.
 *                       The wrapper UI shows a "your message will be
 *                       sent without your name or email" caveat.
 *   - context         — auto-attached, all categorical:
 *       appVersion, route (parameterized!), deviceClass, sessionDepth
 *   - ratings         — optional dimensional ratings (easy/useful/fast/
 *                       beautiful), 1–5 each
 *
 * Forbidden anywhere:
 *   - identity (name, email, phone, deviceId)
 *   - search queries / form values typed elsewhere in the app
 *   - geolocation
 *   - anything resembling a JWT or an API key (we strip the message
 *     before sending if it accidentally contains a key — which would
 *     be a maker problem to leak in the message UI)
 */

import type { DeviceClass } from './analytics.ts';

export const FEEDBACK_KINDS = ['idea', 'bug', 'chat', 'love'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const ALLOWED_FEEDBACK_FIELDS = [
  'threadId',
  'appSlug',
  'kind',
  'message',
  'context',
  'ratings',
] as const;

export const ALLOWED_CONTEXT_FIELDS = ['appVersion', 'route', 'deviceClass', 'sessionDepth'] as const;

export const ALLOWED_RATING_FIELDS = ['easy', 'useful', 'fast', 'beautiful'] as const;

export interface FeedbackContext {
  appVersion?: number;
  /** Parameterized route only. The codec strips concrete IDs. */
  route?: string;
  deviceClass?: DeviceClass;
  /** Number of sessions since install. Coarse — not session id. */
  sessionDepth?: number;
}

export interface FeedbackRatings {
  easy?: number;
  useful?: number;
  fast?: number;
  beautiful?: number;
}

export interface FeedbackPayload {
  threadId: string;
  appSlug: string;
  kind: FeedbackKind;
  message: string;
  context?: FeedbackContext;
  ratings?: FeedbackRatings;
}

export interface BuildFeedbackInput {
  threadId: string;
  appSlug: string;
  kind: string;
  message: string;
  /** Free-shape input that the codec strips through the allowlist. */
  raw?: Record<string, unknown>;
}

const SLUG_RE = /^[a-z0-9-]{1,63}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_MESSAGE_LEN = 1;
const MAX_MESSAGE_LEN = 2000;

const ROUTE_SEGMENT_RE = /^[a-z][a-z0-9_-]{0,40}$/i;
const ROUTE_PLACEHOLDER_RE = /^:[a-z][a-z0-9_]{0,40}$/i;

// Patterns that look like secrets / personal-data — strip from message body.
const SECRET_PATTERNS: RegExp[] = [
  /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
  /\b(?:sk_live_|sk_test_)[A-Za-z0-9]{16,}\b/g, // Stripe
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS
  /\bAIza[0-9A-Za-z_-]{35}\b/g, // Firebase
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g, // GitHub PAT
  /\bsk-[A-Za-z0-9_-]{20,}\b/g, // OpenAI
  /\b\d{16}\b/g, // looks like a card number
];

function asInt(v: unknown, min: number, max: number): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const n = Math.round(v);
  if (n < min || n > max) return undefined;
  return n;
}

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
  if (segments.length > 1 && !hasPlaceholder) return undefined;
  return value;
}

function sanitizeDeviceClass(value: unknown): DeviceClass | undefined {
  return value === 'high' || value === 'mid' || value === 'low' ? value : undefined;
}

function redactMessage(raw: string): string {
  let out = raw;
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, '[redacted]');
  }
  // Normalize whitespace + trim. A user sneaking a 50KB message in is
  // probably accidental copy-paste; trim to MAX_MESSAGE_LEN.
  if (out.length > MAX_MESSAGE_LEN) {
    out = out.slice(0, MAX_MESSAGE_LEN);
  }
  return out;
}

export function buildFeedback(input: BuildFeedbackInput): FeedbackPayload | null {
  if (!UUID_RE.test(input.threadId)) return null;
  if (!SLUG_RE.test(input.appSlug)) return null;
  if (!FEEDBACK_KINDS.includes(input.kind as FeedbackKind)) return null;
  if (typeof input.message !== 'string') return null;
  const message = redactMessage(input.message).trim();
  if (message.length < MIN_MESSAGE_LEN) return null;

  const payload: FeedbackPayload = {
    threadId: input.threadId,
    appSlug: input.appSlug,
    kind: input.kind as FeedbackKind,
    message,
  };

  const raw = input.raw ?? {};
  const rawCtx = raw.context as Record<string, unknown> | undefined;
  if (rawCtx) {
    const ctx: FeedbackContext = {};
    const v = asInt(rawCtx.appVersion, 0, 100_000);
    if (v !== undefined) ctx.appVersion = v;
    const route = sanitizeRoute(rawCtx.route);
    if (route !== undefined) ctx.route = route;
    const dc = sanitizeDeviceClass(rawCtx.deviceClass);
    if (dc !== undefined) ctx.deviceClass = dc;
    const sd = asInt(rawCtx.sessionDepth, 0, 100_000);
    if (sd !== undefined) ctx.sessionDepth = sd;
    if (Object.keys(ctx).length > 0) payload.context = ctx;
  }

  const rawRatings = raw.ratings as Record<string, unknown> | undefined;
  if (rawRatings) {
    const ratings: FeedbackRatings = {};
    for (const key of ALLOWED_RATING_FIELDS) {
      const r = asInt(rawRatings[key], 1, 5);
      if (r !== undefined) ratings[key] = r;
    }
    if (Object.keys(ratings).length > 0) payload.ratings = ratings;
  }

  return payload;
}
