/**
 * shippie.db.*
 *
 * Per-user (private) and shared (public) key/value storage. Every call
 * is routed through /__shippie/storage/* on the app's own origin.
 *
 * Spec v6 §7.1, §18.5.
 */
import { del, get, put } from './http.ts';
import type { DbListOptions, DbSetOptions } from './types.ts';

function encode(v: string): string {
  return encodeURIComponent(v);
}

export async function set<T>(
  collection: string,
  key: string,
  value: T,
  opts: DbSetOptions = {},
): Promise<void> {
  const path = opts.public
    ? `/storage/public/${encode(collection)}/${encode(key)}`
    : `/storage/${encode(collection)}/${encode(key)}`;
  await put(path, { data: value });
}

export async function getItem<T>(collection: string, key: string): Promise<T | null> {
  try {
    const res = await get<{ data: T }>(
      `/storage/${encode(collection)}/${encode(key)}`,
    );
    return res.data ?? null;
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 404) return null;
    throw err;
  }
}

export async function list<T>(collection: string, opts: DbListOptions = {}): Promise<T[]> {
  const base = opts.public
    ? `/storage/public/${encode(collection)}`
    : `/storage/${encode(collection)}`;
  const params = new URLSearchParams();
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.offset != null) params.set('offset', String(opts.offset));
  const path = params.toString() ? `${base}?${params.toString()}` : base;
  const res = await get<{ items: T[] }>(path);
  return res.items ?? [];
}

export async function remove(collection: string, key: string): Promise<void> {
  await del(`/storage/${encode(collection)}/${encode(key)}`);
}

// Named export matches the common "delete" action without colliding with
// the reserved JS keyword.
export { remove as delete };
