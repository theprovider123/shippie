/**
 * Cloudflare Workers KV — REST API adapter.
 *
 * Uses the HTTP API under `/client/v4/accounts/{accountId}/storage/kv/namespaces/{nsId}/...`
 * so the Next.js control plane (running on Vercel / any Node host) can
 * drive the same KV namespace the Worker binds at runtime.
 *
 * Auth:
 *   Authorization: Bearer <CF_API_TOKEN>   (scoped to Workers KV Edit)
 *
 * Behaviour:
 *   - get/put/delete map 1:1 to REST endpoints.
 *   - TTL is forwarded via `expiration_ttl` query param on put.
 *   - list uses the `keys` endpoint with prefix; pagination handled
 *     transparently via the cursor response.
 *   - 5xx responses are retried once with a short backoff; 4xx fail
 *     immediately with the API's error body surfaced.
 *
 * This adapter is deliberately self-contained — no SDK dependency, so
 * the bundle stays small and there is no version drift from Cloudflare
 * internal releases.
 */
import type { KvStore } from '@shippie/dev-storage';

export interface CfKvConfig {
  accountId: string;
  namespaceId: string;
  apiToken: string;
  /** Default fetch timeout per request (ms). Defaults to 10_000. */
  timeoutMs?: number;
  /** Override `fetch` for tests. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class CfKv implements KvStore {
  private readonly accountId: string;
  private readonly namespaceId: string;
  private readonly apiToken: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: CfKvConfig) {
    if (!config.accountId) throw new Error('CfKv: accountId is required');
    if (!config.namespaceId) throw new Error('CfKv: namespaceId is required');
    if (!config.apiToken) throw new Error('CfKv: apiToken is required');
    this.accountId = config.accountId;
    this.namespaceId = config.namespaceId;
    this.apiToken = config.apiToken;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private base(): string {
    return `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/storage/kv/namespaces/${this.namespaceId}`;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      ...extra,
    };
  }

  /**
   * Fetch with a timeout and a single retry on 5xx / network errors.
   * 4xx responses are returned as-is (caller decides).
   */
  private async request(url: string, init: RequestInit): Promise<Response> {
    const attempt = async (): Promise<Response> => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        return await this.fetchImpl(url, { ...init, signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      const res = await attempt();
      if (res.status >= 500) {
        return await attempt();
      }
      return res;
    } catch (err) {
      // Network / abort — retry once
      return await attempt().catch((e) => {
        throw err instanceof Error ? err : e;
      });
    }
  }

  async get(key: string): Promise<string | null> {
    const res = await this.request(
      `${this.base()}/values/${encodeURIComponent(key)}`,
      { method: 'GET', headers: this.headers() },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`CfKv.get(${key}) failed: ${res.status} ${await res.text()}`);
    }
    return await res.text();
  }

  async getJson<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async put(
    key: string,
    value: string,
    opts?: { expirationTtl?: number },
  ): Promise<void> {
    const qs = opts?.expirationTtl
      ? `?expiration_ttl=${encodeURIComponent(String(opts.expirationTtl))}`
      : '';
    const res = await this.request(
      `${this.base()}/values/${encodeURIComponent(key)}${qs}`,
      {
        method: 'PUT',
        headers: this.headers({ 'Content-Type': 'text/plain' }),
        body: value,
      },
    );
    if (!res.ok) {
      throw new Error(`CfKv.put(${key}) failed: ${res.status} ${await res.text()}`);
    }
  }

  async putJson<T = unknown>(
    key: string,
    value: T,
    opts?: { expirationTtl?: number },
  ): Promise<void> {
    await this.put(key, JSON.stringify(value), opts);
  }

  async delete(key: string): Promise<void> {
    const res = await this.request(
      `${this.base()}/values/${encodeURIComponent(key)}`,
      { method: 'DELETE', headers: this.headers() },
    );
    if (res.status === 404) return;
    if (!res.ok) {
      throw new Error(`CfKv.delete(${key}) failed: ${res.status} ${await res.text()}`);
    }
  }

  /**
   * List keys with the given prefix. Transparently pages through the
   * `keys` endpoint's cursor until exhausted.
   */
  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined;
    // Safety bound against runaway pagination in case of an API bug.
    for (let page = 0; page < 1000; page++) {
      const params = new URLSearchParams();
      if (prefix) params.set('prefix', prefix);
      if (cursor) params.set('cursor', cursor);
      params.set('limit', '1000');

      const res = await this.request(
        `${this.base()}/keys?${params.toString()}`,
        { method: 'GET', headers: this.headers() },
      );
      if (!res.ok) {
        throw new Error(
          `CfKv.list(${prefix}) failed: ${res.status} ${await res.text()}`,
        );
      }
      const body = (await res.json()) as {
        success?: boolean;
        result?: Array<{ name: string }>;
        result_info?: { cursor?: string };
      };
      if (!body.success) {
        throw new Error(`CfKv.list(${prefix}) API error: ${JSON.stringify(body)}`);
      }
      for (const entry of body.result ?? []) keys.push(entry.name);
      cursor = body.result_info?.cursor;
      if (!cursor) break;
    }
    return keys;
  }
}
