/**
 * shippie.auth.*
 *
 * BYO backend auth — delegates to the configured BackendAdapter.
 * If no backend is configured (Tier 1 static app), all methods throw
 * `ShippieSDKError('not_configured', ...)` directing the maker to
 * call shippie.configure().
 *
 * Spec v5 §2.
 */
import { getAdapter } from './configure.ts';
import { ShippieSDKError } from './errors.ts';
import type { BackendUser } from './backends/types.ts';

function adapterOrThrow() {
  try {
    return getAdapter();
  } catch (err) {
    throw new ShippieSDKError(
      'not_configured',
      'Shippie SDK is not configured. Call shippie.configure({ backend, client }) before using auth.*',
      err,
    );
  }
}

export async function getUser(): Promise<BackendUser | null> {
  try {
    return await adapterOrThrow().auth.getUser();
  } catch (err) {
    if (err instanceof ShippieSDKError) throw err;
    throw new ShippieSDKError('backend_error', 'auth.getUser() failed', err);
  }
}

export async function signIn(returnTo?: string): Promise<void> {
  try {
    return await adapterOrThrow().auth.signIn(returnTo);
  } catch (err) {
    if (err instanceof ShippieSDKError) throw err;
    throw new ShippieSDKError('backend_error', 'auth.signIn() failed', err);
  }
}

export async function signOut(): Promise<void> {
  try {
    return await adapterOrThrow().auth.signOut();
  } catch (err) {
    if (err instanceof ShippieSDKError) throw err;
    throw new ShippieSDKError('backend_error', 'auth.signOut() failed', err);
  }
}

export function onChange(listener: (user: BackendUser | null) => void): () => void {
  return adapterOrThrow().auth.onChange(listener);
}

/**
 * Returns the current session JWT for use in Authorization headers.
 *
 *   - `null`        — backend is configured, user is signed out
 *   - `string`      — active session
 *   - `throws`      — `ShippieSDKError` for unconfigured SDK or backend failure
 *
 * Breaking change from SDK 2.0.x: previously this swallowed all errors
 * and returned null, making "signed out" and "backend threw" look
 * identical. Callers that relied on the old shape should catch
 * `ShippieSDKError` explicitly or use `isShippieSDKError()`.
 */
export async function getToken(): Promise<string | null> {
  let adapter;
  try {
    adapter = getAdapter();
  } catch (err) {
    throw new ShippieSDKError(
      'not_configured',
      'Shippie SDK is not configured. Call shippie.configure({ backend, client }) before using auth.getToken().',
      err,
    );
  }
  try {
    return await adapter.auth.getToken();
  } catch (err) {
    throw new ShippieSDKError('backend_error', 'auth.getToken() failed', err);
  }
}
