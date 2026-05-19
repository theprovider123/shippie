/**
 * shippie.db.*
 *
 * Legacy BYO backend storage — delegates to the configured BackendAdapter.
 * Public Shippie marketplace tools should use `shippie.local.db` instead.
 *
 * Kept for older embedded apps and migration helpers.
 */
import { getAdapter } from './configure.ts';

export async function set<T>(
  collection: string,
  key: string,
  value: T,
): Promise<void> {
  return getAdapter().db.set(collection, key, value);
}

export async function getItem<T>(collection: string, key: string): Promise<T | null> {
  return getAdapter().db.get<T>(collection, key);
}

export async function list<T>(
  collection: string,
  opts?: { limit?: number; offset?: number },
): Promise<T[]> {
  return getAdapter().db.list<T>(collection, opts);
}

export async function remove(collection: string, key: string): Promise<void> {
  return getAdapter().db.delete(collection, key);
}

export { remove as delete };
