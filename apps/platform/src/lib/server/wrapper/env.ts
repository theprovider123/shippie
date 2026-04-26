/**
 * Wrapper-side type aliases.
 *
 * The full Cloudflare env shape lives in apps/platform/src/app.d.ts on
 * `App.Platform.env`. This file just re-exports a short, importable
 * alias for router-handler signatures so they don't drag in the
 * SvelteKit ambient `App` namespace (which isn't visible from a
 * library file outside SvelteKit's own resolution).
 */
import type {
  D1Database,
  R2Bucket,
  KVNamespace,
  DurableObjectNamespace
} from '@cloudflare/workers-types';

export interface WrapperEnv {
  DB: D1Database;
  APPS: R2Bucket;
  // R2 bucket for icons, splashes, SDK js. Renamed from ASSETS because
  // SvelteKit's adapter-cloudflare claims the `ASSETS` binding name for
  // its static-content fetcher.
  PLATFORM_ASSETS: R2Bucket;
  // SvelteKit static-content binding (Workers Assets). Wrapper code
  // doesn't fetch through this — it's here only to satisfy the env
  // shape for code that types against the full platform env.
  ASSETS?: { fetch: typeof fetch };
  CACHE: KVNamespace;
  SIGNAL_ROOM?: DurableObjectNamespace;
  SHIPPIE_ENV: string;
  PUBLIC_ORIGIN: string;
  // Phase 3 secrets — still relevant for some wrapper paths.
  AUTH_SECRET?: string;
  // Invite-cookie HMAC secret (private apps).
  INVITE_SECRET?: string;
}

export interface WrapperContext {
  request: Request;
  env: WrapperEnv;
  slug: string;
  traceId: string;
}
