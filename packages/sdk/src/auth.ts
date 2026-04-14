/**
 * shippie.auth.*
 *
 * Same-origin calls to /__shippie/auth/* and /__shippie/session. The
 * Cloudflare Worker handles these paths and sets/reads the opaque-handle
 * session cookie scoped to this app's origin.
 *
 * Spec v6 §6, §7.1.
 */
import { get, post } from './http.ts';
import type { User } from './types.ts';

type ChangeListener = (user: User | null) => void;
const listeners = new Set<ChangeListener>();
let lastKnown: User | null = null;

export async function getUser(): Promise<User | null> {
  try {
    const res = await get<{ user: User | null }>('/session');
    updateLastKnown(res.user ?? null);
    return res.user ?? null;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) {
      updateLastKnown(null);
      return null;
    }
    throw err;
  }
}

/**
 * Start the OAuth flow. Navigates the whole page to /__shippie/auth/login
 * because OAuth requires a top-level redirect; popup mode may be added
 * as an option later.
 */
export async function signIn(returnTo?: string): Promise<void> {
  const target = returnTo
    ? `/__shippie/auth/login?return_to=${encodeURIComponent(returnTo)}`
    : `/__shippie/auth/login`;
  if (typeof window === 'undefined') {
    throw new Error('shippie.auth.signIn requires a browser environment');
  }
  window.location.href = target;
}

export async function signOut(): Promise<void> {
  await post('/auth/logout');
  updateLastKnown(null);
}

export function onChange(listener: ChangeListener): () => void {
  listeners.add(listener);
  // Fire immediately with last known state for imperative simplicity
  queueMicrotask(() => listener(lastKnown));
  return () => {
    listeners.delete(listener);
  };
}

function updateLastKnown(user: User | null): void {
  if (user?.id !== lastKnown?.id) {
    lastKnown = user;
    for (const l of listeners) l(user);
  }
}
