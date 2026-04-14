/**
 * Cloudflare Workers entry point.
 *
 * wrangler.toml points at this file. In production, Cloudflare provides the
 * KV and R2 bindings directly on env. We adapt them to the KvStore / R2Store
 * interfaces so router code doesn't branch on runtime.
 *
 * Spec v6 §2.1.
 */
import { createApp } from './app.ts';
import type { WorkerEnv } from './env.ts';
import type { KvStore } from './kv/types.ts';
import type { R2HttpMetadata, R2Object, R2ObjectHead, R2Store } from './r2/types.ts';

/**
 * Cloudflare-native env shape as it arrives into the Worker.
 * The KV and R2 bindings here are CF's native objects.
 */
interface CloudflareEnv {
  SHIPPIE_ENV: string;
  PLATFORM_API_URL: string;
  WORKER_PLATFORM_SECRET: string;
  APP_CONFIG: CloudflareKv;
  SHIPPIE_APPS: CloudflareR2;
  SHIPPIE_PUBLIC: CloudflareR2;
}

interface CloudflareKv {
  get(key: string, type?: 'text' | 'json'): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
}

interface CloudflareR2Object {
  key: string;
  size: number;
  httpMetadata?: { contentType?: string };
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T>(): Promise<T>;
}

interface CloudflareR2 {
  get(key: string): Promise<CloudflareR2Object | null>;
  head(key: string): Promise<CloudflareR2Object | null>;
  put(
    key: string,
    value: ArrayBuffer | ReadableStream | Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ objects: CloudflareR2Object[] }>;
}

function wrapKv(kv: CloudflareKv): KvStore {
  return {
    get: (key) => kv.get(key),
    getJson: async <T>(key: string): Promise<T | null> => {
      const raw = await kv.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    },
    put: (key, value, opts) => kv.put(key, value, opts),
    putJson: (key, value, opts) => kv.put(key, JSON.stringify(value), opts),
    delete: (key) => kv.delete(key),
    list: async (prefix) => {
      const res = await kv.list({ prefix });
      return res.keys.map((k) => k.name);
    },
  };
}

function wrapR2(r2: CloudflareR2): R2Store {
  return {
    get: async (key) => {
      const obj = await r2.get(key);
      return obj ? wrapR2Object(obj) : null;
    },
    head: async (key) => {
      const obj = await r2.head(key);
      return obj ? { key: obj.key, size: obj.size, httpMetadata: obj.httpMetadata } : null;
    },
    put: (key, value, metadata) =>
      r2.put(key, value, metadata ? { httpMetadata: { contentType: metadata.contentType } } : undefined),
    delete: (key) => r2.delete(key),
    list: async (prefix) => {
      const res = await r2.list({ prefix });
      return res.objects.map((o) => o.key);
    },
  };
}

function wrapR2Object(obj: CloudflareR2Object): R2Object {
  const head: R2ObjectHead = {
    key: obj.key,
    size: obj.size,
    httpMetadata: obj.httpMetadata,
  };
  return {
    ...head,
    body: async () => new Uint8Array(await obj.arrayBuffer()),
    text: () => obj.text(),
    json: <T>() => obj.json<T>(),
    arrayBuffer: () => obj.arrayBuffer(),
  };
}

const app = createApp();

export default {
  fetch: async (request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> => {
    const workerEnv: WorkerEnv = {
      SHIPPIE_ENV: env.SHIPPIE_ENV,
      PLATFORM_API_URL: env.PLATFORM_API_URL,
      WORKER_PLATFORM_SECRET: env.WORKER_PLATFORM_SECRET,
      APP_CONFIG: wrapKv(env.APP_CONFIG),
      SHIPPIE_APPS: wrapR2(env.SHIPPIE_APPS),
      SHIPPIE_PUBLIC: wrapR2(env.SHIPPIE_PUBLIC),
    };
    return app.fetch(request, workerEnv, ctx);
  },
};
