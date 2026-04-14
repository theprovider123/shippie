/**
 * Local-dev storage adapter contracts.
 *
 * Both `@shippie/worker` and `apps/web` use these interfaces to share
 * state in dev. Production uses Cloudflare KV + R2 directly.
 */
export interface KvStore {
  get(key: string): Promise<string | null>;
  getJson<T = unknown>(key: string): Promise<T | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  putJson<T = unknown>(key: string, value: T, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

export interface R2HttpMetadata {
  contentType?: string;
  cacheControl?: string;
  contentEncoding?: string;
  contentLanguage?: string;
}

export interface R2ObjectHead {
  key: string;
  size: number;
  httpMetadata?: R2HttpMetadata;
}

export interface R2Object extends R2ObjectHead {
  body(): Promise<Uint8Array>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2Store {
  get(key: string): Promise<R2Object | null>;
  head(key: string): Promise<R2ObjectHead | null>;
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    metadata?: R2HttpMetadata,
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}
