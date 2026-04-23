/**
 * KV helpers for the deploy pipeline.
 *
 * In dev, we use `DevKv` writing to `.shippie-dev-state/kv/app-config/` —
 * the same filesystem-backed directory the Worker dev server reads from,
 * so a wrap row flips the runtime path immediately after the deploy
 * route returns.
 *
 * In prod, the Cloudflare KV binding is fronted via Wrangler / direct
 * binding. For now we reuse the DevKv adapter against the shared dir;
 * the signed-request spine (Phase B) will swap in a real CF KV client
 * via the worker-control plane. The accessor `getDeployKv()` is the
 * single hook to change when that swap lands.
 */
import { DevKv, getDevKvDir, type KvStore } from '@shippie/dev-storage';

let cachedKv: KvStore | null = null;

function getDeployKv(): KvStore {
  if (cachedKv) return cachedKv;
  cachedKv = new DevKv(getDevKvDir());
  return cachedKv;
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
