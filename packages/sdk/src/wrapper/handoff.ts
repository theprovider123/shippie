// packages/sdk/src/wrapper/handoff.ts
/**
 * Desktop → mobile handoff helpers. Pure functions; caller renders UI.
 *
 * The handoff URL adds `?ref=handoff` for attribution. Callers that
 * encode the URL into a QR, email body, or push payload all use the
 * same helper so attribution is consistent.
 *
 * Spec §5.2.
 */
const REF_PARAM = 'ref';
const REF_VALUE = 'handoff';

export function buildHandoffUrl(currentUrl: string): string {
  const url = new URL(currentUrl);
  if (url.searchParams.has(REF_PARAM)) {
    return url.toString();
  }
  url.searchParams.set(REF_PARAM, REF_VALUE);
  return url.toString();
}

// Minimal, deliberately-strict email check. Good enough for
// client-side validation before POST; server-side Resend/SES
// validation is the real gate.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.length === 0) return false;
  return EMAIL_RE.test(trimmed);
}

export interface HandoffEmailPayload {
  email: string;
  handoff_url: string;
}

export function buildHandoffEmailPayload(
  currentUrl: string,
  email: string,
): HandoffEmailPayload {
  return {
    email: email.trim(),
    handoff_url: buildHandoffUrl(currentUrl),
  };
}
