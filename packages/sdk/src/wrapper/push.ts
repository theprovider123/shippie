// packages/sdk/src/wrapper/push.ts
/**
 * Web Push subscription helpers.
 *
 * Flow:
 *   1. Fetch VAPID public key from the platform.
 *   2. Call pushManager.subscribe() with the key.
 *   3. POST the subscription to /__shippie/push/subscribe.
 *
 * Cleanup mirrors this: getSubscription → unsubscribe → POST unsubscribe.
 */

const DEFAULT_VAPID_ENDPOINT = '/__shippie/push/vapid-key';
const DEFAULT_SUBSCRIBE_ENDPOINT = '/__shippie/push/subscribe';
const DEFAULT_UNSUBSCRIBE_ENDPOINT = '/__shippie/push/unsubscribe';

export interface PushEndpoints {
  vapid?: string;
  subscribe?: string;
  unsubscribe?: string;
}

export interface SubscribeResult {
  ok: boolean;
  reason?: string;
}

type WindowWithPushManager = Window & { PushManager?: unknown };

export function pushSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { serviceWorker?: unknown };
  const win = window as WindowWithPushManager;
  return 'serviceWorker' in nav && nav.serviceWorker !== undefined && typeof win.PushManager !== 'undefined';
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const s = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function subscribePush(endpoints: PushEndpoints = {}): Promise<SubscribeResult> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  try {
    const vapidRes = await fetch(endpoints.vapid ?? DEFAULT_VAPID_ENDPOINT);
    if (!vapidRes.ok) return { ok: false, reason: 'vapid-fetch-failed' };
    const { key } = (await vapidRes.json()) as { key: string };
    const sw = (navigator as Navigator & { serviceWorker: { ready: Promise<ServiceWorkerRegistration> } }).serviceWorker;
    const reg = await sw.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    });
    const subRes = await fetch(endpoints.subscribe ?? DEFAULT_SUBSCRIBE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!subRes.ok) return { ok: false, reason: 'subscribe-post-failed' };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown' };
  }
}

export async function unsubscribePush(endpoints: PushEndpoints = {}): Promise<SubscribeResult> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  try {
    const sw = (navigator as Navigator & { serviceWorker: { ready: Promise<ServiceWorkerRegistration> } }).serviceWorker;
    const reg = await sw.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return { ok: true };
    await sub.unsubscribe();
    await fetch(endpoints.unsubscribe ?? DEFAULT_UNSUBSCRIBE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown' };
  }
}
