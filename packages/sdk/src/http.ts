/**
 * Same-origin HTTP helper.
 *
 * Every call is a plain fetch to /__shippie/* on the app's own origin.
 * The Cloudflare Worker handles __shippie/* and proxies to the platform
 * internal API with HMAC-signed headers. The SDK never talks to
 * shippie.app directly, so there's no CORS, no cross-origin tokens,
 * and no third-party cookie dependency.
 *
 * Spec v6 §7 (SDK design), §5 (reserved routes).
 */
const SHIPPIE_BASE = '/__shippie';

export interface HttpError extends Error {
  status: number;
  body: unknown;
}

function httpError(status: number, body: unknown, message: string): HttpError {
  const err = new Error(message) as HttpError;
  err.name = 'ShippieHttpError';
  err.status = status;
  err.body = body;
  return err;
}

export async function get<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>('GET', path, undefined, init);
}

export async function post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return request<T>('POST', path, body, init);
}

export async function put<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return request<T>('PUT', path, body, init);
}

export async function del<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>('DELETE', path, undefined, init);
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  const url = path.startsWith('/') ? `${SHIPPIE_BASE}${path}` : `${SHIPPIE_BASE}/${path}`;
  const headers = new Headers(init?.headers);
  if (body !== undefined) headers.set('content-type', 'application/json');

  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...init,
  });

  const contentType = res.headers.get('content-type') ?? '';
  const parsed: unknown = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    throw httpError(
      res.status,
      parsed,
      `shippie: ${method} ${path} → ${res.status}`,
    );
  }

  return parsed as T;
}
