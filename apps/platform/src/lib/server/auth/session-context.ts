import type { D1Database } from '@cloudflare/workers-types';

export type ClientSurface = 'web' | 'pwa' | 'mobile_web' | 'desktop_web' | 'unknown';

const MAX_CLIENT_NAME = 80;
const MAX_USER_AGENT = 280;

function cleanText(value: string | null | undefined, max = MAX_CLIENT_NAME): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.slice(0, max);
}

function browserFromUa(ua: string): string {
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/CriOS|Chrome\//i.test(ua)) return 'Chrome';
  if (/FxiOS|Firefox\//i.test(ua)) return 'Firefox';
  if (/Version\/.*Safari\//i.test(ua) || /Safari\//i.test(ua)) return 'Safari';
  return 'Browser';
}

function deviceFromUa(ua: string): string {
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  return 'device';
}

export function inferClientName(request: Request, override?: string | null): string {
  const cleaned = cleanText(override);
  if (cleaned) return cleaned;
  const ua = request.headers.get('user-agent') ?? '';
  return `${browserFromUa(ua)} on ${deviceFromUa(ua)}`;
}

export function inferClientSurface(request: Request, override?: string | null): ClientSurface {
  const cleaned = cleanText(override, 32);
  if (cleaned === 'pwa' || cleaned === 'mobile_web' || cleaned === 'desktop_web' || cleaned === 'web') {
    return cleaned;
  }
  const ua = request.headers.get('user-agent') ?? '';
  if (/Mobile|iPhone|iPad|Android/i.test(ua)) return 'mobile_web';
  if (ua) return 'desktop_web';
  return 'unknown';
}

async function hashClientId(clientId: string | null | undefined): Promise<string | null> {
  const cleaned = cleanText(clientId, 128);
  if (!cleaned) return null;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cleaned));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function annotateSessionContext(input: {
  db: D1Database;
  sessionId: string;
  request: Request;
  clientId?: string | null;
  clientName?: string | null;
  clientSurface?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const clientIdHash = await hashClientId(input.clientId);
  const clientName = inferClientName(input.request, input.clientName);
  const clientSurface = inferClientSurface(input.request, input.clientSurface);
  const userAgent = cleanText(input.request.headers.get('user-agent'), MAX_USER_AGENT);

  await input.db
    .prepare(
      `UPDATE sessions
       SET client_name = ?,
           client_surface = ?,
           client_id_hash = ?,
           user_agent = ?,
           created_at = COALESCE(created_at, ?),
           last_seen_at = ?
       WHERE id = ?`,
    )
    .bind(clientName, clientSurface, clientIdHash, userAgent, now, now, input.sessionId)
    .run();
}

export async function touchSessionContext(input: {
  db: D1Database;
  sessionId: string;
  request: Request;
}): Promise<void> {
  const now = new Date().toISOString();
  const clientName = inferClientName(input.request);
  const clientSurface = inferClientSurface(input.request);
  const userAgent = cleanText(input.request.headers.get('user-agent'), MAX_USER_AGENT);

  await input.db
    .prepare(
      `UPDATE sessions
       SET last_seen_at = ?,
           client_name = COALESCE(client_name, ?),
           client_surface = COALESCE(client_surface, ?),
           user_agent = COALESCE(user_agent, ?),
           created_at = COALESCE(created_at, ?)
       WHERE id = ?`,
    )
    .bind(now, clientName, clientSurface, userAgent, now, input.sessionId)
    .run();
}
