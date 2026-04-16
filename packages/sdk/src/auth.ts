/**
 * shippie.auth.*
 *
 * BYO backend auth — delegates to the configured BackendAdapter.
 * If no backend is configured (Tier 1 static app), all methods throw
 * a clear error directing the maker to call shippie.configure().
 *
 * Spec v5 §2.
 */
import { getAdapter } from './configure.ts';
import type { BackendUser } from './backends/types.ts';

export async function getUser(): Promise<BackendUser | null> {
  return getAdapter().auth.getUser();
}

export async function signIn(returnTo?: string): Promise<void> {
  return getAdapter().auth.signIn(returnTo);
}

export async function signOut(): Promise<void> {
  return getAdapter().auth.signOut();
}

export function onChange(listener: (user: BackendUser | null) => void): () => void {
  return getAdapter().auth.onChange(listener);
}

/**
 * Returns the current session JWT for use in Authorization headers
 * (e.g., for identified feedback/analytics). Returns null if not
 * signed in or no backend configured.
 */
export async function getToken(): Promise<string | null> {
  try {
    return await getAdapter().auth.getToken();
  } catch {
    return null;
  }
}
