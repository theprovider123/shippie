/**
 * Signed fetch to the Shippie platform internal API.
 *
 * Every request carries:
 *   X-Shippie-Signature: HMAC_SHA256(secret, METHOD\nPATH\nBODY_HASH\nTIMESTAMP)
 *   X-Shippie-Timestamp: unix ms
 *
 * The shared implementation lives in @shippie/session-crypto so both
 * the worker and the platform use the same canonical input.
 *
 * Spec v6 §6.3.
 */
import { signWorkerRequest } from '@shippie/session-crypto';
import type { WorkerEnv } from './env.ts';

export async function platformFetch(
  env: WorkerEnv,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const bodyStr = body == null ? '' : JSON.stringify(body);
  const { signature, timestamp } = await signWorkerRequest(
    env.WORKER_PLATFORM_SECRET,
    method,
    path,
    bodyStr,
  );

  const url = `${env.PLATFORM_API_URL}${path}`;
  return fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-shippie-signature': signature,
      'x-shippie-timestamp': timestamp,
    },
    body: bodyStr || undefined,
  });
}

export async function platformJson<T>(
  env: WorkerEnv,
  method: string,
  path: string,
  body?: unknown,
): Promise<
  { ok: true; status: number; data: T } | { ok: false; status: number; data: unknown }
> {
  const res = await platformFetch(env, method, path, body);
  const contentType = res.headers.get('content-type') ?? '';
  const parsed = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    return { ok: false, status: res.status, data: parsed };
  }
  return { ok: true, status: res.status, data: parsed as T };
}
