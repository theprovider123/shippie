/**
 * Minimal KV interface mirroring the parts of Cloudflare's KV API we use.
 * Local dev uses an in-memory + filesystem-backed implementation.
 *
 * Spec v6 §2.1 (runtime plane).
 */
export interface KvStore {
  get(key: string): Promise<string | null>;
  getJson<T = unknown>(key: string): Promise<T | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  putJson<T = unknown>(key: string, value: T, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}
