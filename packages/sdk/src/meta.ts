/**
 * shippie.meta()
 *
 * Returns the app's public metadata as stored in APP_CONFIG KV.
 * Spec v6 §7.1.
 */
import { get } from './http.ts';
import type { AppMeta } from './types.ts';

export async function meta(): Promise<AppMeta | null> {
  try {
    return await get<AppMeta>('/meta');
  } catch {
    return null;
  }
}
