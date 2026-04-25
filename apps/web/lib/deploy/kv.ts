/**
 * KV helpers for the deploy pipeline.
 *
 * In dev, we use `DevKv` writing to `.shippie-dev-state/kv/app-config/` —
 * the same filesystem-backed directory the Worker dev server reads from,
 * so a wrap row flips the runtime path immediately after the deploy
 * route returns.
 *
 * In prod we route through `@shippie/cf-storage`'s `CfKv` against the
 * Cloudflare Workers KV REST API, using the APP_CONFIG namespace the
 * Worker binds at runtime. Selection is env-driven — see `getDeployKv`
 * below and the envs documented in `packages/cf-storage/README.md`.
 */
import { DevKv, getDevKvDir, type KvStore } from '@shippie/dev-storage';
import { CfKv } from '@shippie/cf-storage';

let cachedKv: KvStore | null = null;

function getDeployKv(): KvStore {
  if (cachedKv) return cachedKv;
  const built: KvStore = isProdKvSelected() ? buildCfKv() : new DevKv(getDevKvDir());
  cachedKv = built;
  return built;
}

function isProdKvSelected(): boolean {
  if (process.env.SHIPPIE_ENV === 'production') return true;
  if (process.env.NODE_ENV === 'production' && process.env.CF_ACCOUNT_ID) return true;
  return false;
}

function buildCfKv(): CfKv {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  const namespaceId = process.env.CF_KV_NAMESPACE_ID;
  const missing: string[] = [];
  if (!accountId) missing.push('CF_ACCOUNT_ID');
  if (!apiToken) missing.push('CF_API_TOKEN');
  if (!namespaceId) missing.push('CF_KV_NAMESPACE_ID');
  if (missing.length > 0) {
    throw new Error(
      `[shippie:deploy/kv] Production KV selected but missing env vars: ${missing.join(', ')}. ` +
        `See packages/cf-storage/README.md for setup.`,
    );
  }
  return new CfKv({ accountId: accountId!, apiToken: apiToken!, namespaceId: namespaceId! });
}

export interface WrapMetaWrite {
  upstream_url: string;
  csp_mode: 'lenient' | 'strict';
}

/**
 * Write the wrap-mode KV row the Worker dispatches on. Key matches
 * `apps:{slug}:wrap` — the Worker's `loadWrapMeta` accessor reads the
 * same key and caches it for 30s.
 */
export async function writeWrapMeta(slug: string, meta: WrapMetaWrite): Promise<void> {
  const kv = getDeployKv();
  await kv.putJson(`apps:${slug}:wrap`, meta);
}

export interface AppRuntimeMeta {
  visibility_scope: 'public' | 'unlisted' | 'private';
}

/**
 * Merge patch into the app runtime metadata KV row (currently just
 * visibility_scope). The Worker's `loadAppMeta` accessor reads
 * `apps:{slug}:meta` to power the private-app access gate.
 *
 * Preserves any existing fields (name, type, version, etc. — written by
 * the static deploy hot path) by read-then-merge-then-write.
 */
export async function writeAppMeta(slug: string, patch: AppRuntimeMeta): Promise<void> {
  const kv = getDeployKv();
  const existing = (await kv.getJson(`apps:${slug}:meta`)) as Record<string, unknown> | null;
  await kv.putJson(`apps:${slug}:meta`, { ...(existing ?? {}), ...patch });
}
