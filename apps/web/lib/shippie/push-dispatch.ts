// apps/web/lib/shippie/push-dispatch.ts
/**
 * Web Push dispatcher — production implementation using VAPID JWT +
 * aes128gcm per RFC 8291.
 *
 * Reads `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` from the
 * environment. If any is missing we return `vapid_not_configured` so
 * callers can surface a clean "push not set up" signal instead of
 * blowing up at runtime.
 *
 * - `VAPID_PRIVATE_KEY`: base64url-encoded raw 32-byte P-256 scalar.
 * - `VAPID_PUBLIC_KEY`:  base64url-encoded uncompressed P-256 point (65 bytes).
 * - `VAPID_SUBJECT`:     RFC 8292 subject (usually `mailto:` URI).
 */
import { signVapidJwt, encryptPayloadAes128gcm, type PushTarget } from './vapid.ts';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}
export interface PushResult {
  ok: boolean;
  reason?: string;
  status?: number;
}
export type { PushTarget };

const DEFAULT_TTL_SECONDS = 60 * 60 * 12;

function decodeB64urlPrivateKey(raw: string): Uint8Array {
  return new Uint8Array(Buffer.from(raw, 'base64url'));
}

export async function dispatchPush(
  target: PushTarget,
  payload: PushPayload,
  opts: { ttl?: number } = {},
): Promise<PushResult> {
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!vapidPrivate || !vapidPublic || !subject) {
    return { ok: false, reason: 'vapid_not_configured' };
  }

  const url = new URL(target.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const privKey = decodeB64urlPrivateKey(vapidPrivate);

  const jwt = await signVapidJwt(
    { audience, subject, expiresInSeconds: DEFAULT_TTL_SECONDS },
    privKey,
  );

  const body = await encryptPayloadAes128gcm(
    target,
    new TextEncoder().encode(JSON.stringify(payload)),
  );

  const res = await fetch(target.endpoint, {
    method: 'POST',
    headers: {
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      'ttl': String(opts.ttl ?? DEFAULT_TTL_SECONDS),
      'authorization': `vapid t=${jwt}, k=${vapidPublic}`,
    },
    // `body` is a Uint8Array; runtime accepts it, but TS lib types don't
    // list Uint8Array in BodyInit. Cast through BufferSource.
    body: body as unknown as BodyInit,
  });

  if (res.status === 404 || res.status === 410) {
    return { ok: false, status: res.status, reason: 'gone' };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, reason: 'push_failed' };
  }
  return { ok: true, status: res.status };
}
