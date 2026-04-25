/**
 * KV-backed read/write of the maker's overridden shippie.json.
 *
 * The deploy pipeline always uses the maker's uploaded shippie.json (or
 * an auto-drafted one) at deploy time. The Enhancements tab lets the
 * maker edit a separate KV-stored override that the next deploy will
 * pick up. Stored under `apps:{slug}:shippie-json`.
 */
import { CfKv } from '@shippie/cf-storage';
import { DevKv, getDevKvDir, type KvStore } from '@shippie/dev-storage';

let cachedKv: KvStore | null = null;

function getKv(): KvStore {
  if (cachedKv) return cachedKv;
  const isProd =
    process.env.SHIPPIE_ENV === 'production' ||
    (process.env.NODE_ENV === 'production' && process.env.CF_ACCOUNT_ID);
  if (isProd) {
    cachedKv = new CfKv({
      accountId: process.env.CF_ACCOUNT_ID!,
      apiToken: process.env.CF_API_TOKEN!,
      namespaceId: process.env.CF_KV_NAMESPACE_ID!,
    });
  } else {
    cachedKv = new DevKv(getDevKvDir());
  }
  return cachedKv;
}

const key = (slug: string) => `apps:${slug}:shippie-json`;

export async function readShippieJson(slug: string): Promise<Record<string, unknown> | null> {
  const kv = getKv();
  const raw = await kv.getJson(key(slug));
  return (raw as Record<string, unknown> | null) ?? null;
}

export async function writeShippieJson(
  slug: string,
  json: Record<string, unknown>,
): Promise<void> {
  const kv = getKv();
  await kv.putJson(key(slug), json);
}

export async function clearShippieJson(slug: string): Promise<void> {
  const kv = getKv();
  await kv.delete(key(slug));
}
