// apps/web/lib/shippie/push-dispatch.ts
/**
 * Web Push dispatcher — STUB in Phase 2/3.
 *
 * Production implementation requires VAPID JWT signing + aes128gcm
 * envelope encryption of the payload. We keep the surface typed so
 * routes can call it safely and get a clean `not_implemented` signal;
 * Phase 4 will wire the crypto.
 *
 * TODO Phase 4: VAPID signing with SubtleCrypto (webcrypto). Sign a
 * JWT from VAPID_PRIVATE_KEY, encrypt the payload with aes128gcm using
 * the subscription's p256dh key, POST to target.endpoint with the
 * signed Authorization + Crypto-Key + TTL headers.
 */

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

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

export async function dispatchPush(
  _target: PushTarget,
  _payload: PushPayload,
): Promise<PushResult> {
  // TODO Phase 4: sign a VAPID JWT from VAPID_PRIVATE_KEY, encrypt
  // payload with aes128gcm using the subscription's p256dh key, POST
  // to target.endpoint with the signed headers.
  return { ok: false, reason: 'not_implemented' };
}
