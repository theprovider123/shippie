const EVENT_NAME_RE = /^[a-z][a-z0-9_.:-]{0,127}$/i;
const SESSION_ID_RE = /^[a-z0-9_-]{1,128}$/i;
const SAFE_KEY_RE = /^[a-z][a-z0-9_.:-]{0,63}$/i;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const URL_RE = /\bhttps?:\/\//i;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const SENSITIVE_KEY_RE =
  /(?:email|e-?mail|phone|password|secret|token|address|location|latitude|longitude|query|search|message|note|body|content|referrer|url)$/i;

const MAX_PROPERTY_KEYS = 24;
const MAX_ARRAY_ITEMS = 10;
const MAX_STRING_LENGTH = 80;
const MAX_DEPTH = 2;

export interface RawAnalyticsEvent {
  event?: unknown;
  event_type?: unknown;
  event_name?: unknown;
  props?: unknown;
  properties?: unknown;
  session_id?: unknown;
  url?: unknown;
  referrer?: unknown;
  user_id?: unknown;
}

export interface SanitizedAnalyticsEvent {
  eventName: string;
  properties: Record<string, unknown> | null;
  sessionId: string | null;
  url: null;
  referrer: null;
  userId: null;
}

export function sanitizeAnalyticsEvent(input: RawAnalyticsEvent): SanitizedAnalyticsEvent | null {
  const eventName = sanitizeEventName(input.event_name ?? input.event_type ?? input.event);
  if (!eventName) return null;

  return {
    eventName,
    properties: sanitizeProperties(input.properties ?? input.props),
    sessionId: sanitizeSessionId(input.session_id),
    url: null,
    referrer: null,
    userId: null,
  };
}

export function sanitizeEventName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (!EVENT_NAME_RE.test(name)) return null;
  return name;
}

export function sanitizeSessionId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return SESSION_ID_RE.test(id) ? id : null;
}

export function sanitizeProperties(value: unknown): Record<string, unknown> | null {
  const out = sanitizeObject(value, 0);
  return out && Object.keys(out).length > 0 ? out : null;
}

function sanitizeObject(value: unknown, depth: number): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > MAX_DEPTH) return null;
  const out: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(value as Record<string, unknown>).slice(0, MAX_PROPERTY_KEYS)) {
    const safeKey = sanitizePropertyKey(key);
    if (!safeKey) continue;
    const safeValue = sanitizePropertyValue(raw, depth);
    if (safeValue !== undefined) out[safeKey] = safeValue;
  }

  return Object.keys(out).length > 0 ? out : null;
}

function sanitizePropertyKey(key: string): string | null {
  if (!SAFE_KEY_RE.test(key)) return null;
  if (SENSITIVE_KEY_RE.test(key)) return null;
  return key;
}

function sanitizePropertyValue(value: unknown, depth: number): unknown {
  if (value == null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? clampNumber(value) : undefined;
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizePropertyValue(item, depth + 1))
      .filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (typeof value === 'object' && depth < MAX_DEPTH) return sanitizeObject(value, depth + 1) ?? undefined;
  return undefined;
}

function sanitizeString(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_STRING_LENGTH) return undefined;
  if (CONTROL_RE.test(trimmed) || EMAIL_RE.test(trimmed) || URL_RE.test(trimmed)) return undefined;
  return trimmed;
}

function clampNumber(value: number): number {
  if (value > 1_000_000_000) return 1_000_000_000;
  if (value < -1_000_000_000) return -1_000_000_000;
  return value;
}
