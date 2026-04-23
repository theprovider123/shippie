/**
 * Shared HTTP helpers for CLI commands.
 *
 * Reads the token at ~/.shippie/token (written by `shippie login`) and
 * sends it as a Bearer token on every request. Callers pass the API base
 * URL explicitly — the existing per-command `--api` flag stays authoritative.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';

export function tokenPath(): string {
  return resolve(homedir(), '.shippie', 'token');
}

function authHeaders(): Record<string, string> {
  const p = tokenPath();
  if (!existsSync(p)) {
    throw new Error('Not logged in. Run: shippie login');
  }
  return { authorization: `Bearer ${readFileSync(p, 'utf8').trim()}` };
}

async function parseOrThrow<T>(res: Response, method: string, path: string): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${method} ${path} failed: ${res.status} ${body}`.trim());
  }
  return (await res.json()) as T;
}

export interface ApiOpts {
  apiUrl: string;
}

export async function postJson<T>(opts: ApiOpts, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${opts.apiUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  return parseOrThrow<T>(res, 'POST', path);
}

export async function getJson<T>(opts: ApiOpts, path: string): Promise<T> {
  const res = await fetch(`${opts.apiUrl}${path}`, {
    headers: { ...authHeaders() },
  });
  return parseOrThrow<T>(res, 'GET', path);
}

export async function delJson<T>(opts: ApiOpts, path: string): Promise<T> {
  const res = await fetch(`${opts.apiUrl}${path}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  return parseOrThrow<T>(res, 'DELETE', path);
}
