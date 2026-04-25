/**
 * Production Cloudflare storage adapters for the Shippie control plane.
 *
 * Mirrors the `KvStore` + `R2Store` interfaces from `@shippie/dev-storage`
 * so the deploy pipeline can swap adapters based on environment without
 * touching any call sites.
 *
 * See `packages/cf-storage/README.md` for setup (namespace creation,
 * bucket creation, required env vars).
 */
export type {
  KvStore,
  R2HttpMetadata,
  R2Object,
  R2ObjectHead,
  R2Store,
} from '@shippie/dev-storage';

export { CfKv, type CfKvConfig } from './cf-kv.ts';
export { CfR2, type CfR2Config } from './cf-r2.ts';
