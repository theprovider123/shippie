/**
 * Minimal R2 interface mirroring the parts of Cloudflare's R2 API we use.
 * Local dev uses a filesystem-backed implementation.
 *
 * Spec v6 §2.1 (runtime plane).
 */
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
