// SvelteKit ambient types — augments Locals + Platform with Cloudflare bindings.
// See wrangler.toml for the binding declarations.
//
// Phase 3: Lucia user/session types are populated by hooks.server.ts.

import type { D1Database, R2Bucket, KVNamespace, DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Session } from 'lucia';
import type { AppUser, AppLucia } from '$server/auth/lucia';

declare global {
  namespace App {
    interface Error {
      message: string;
      code?: string;
    }

    interface Locals {
      user: AppUser | null;
      session: Session | null;
      lucia: AppLucia | null;
    }

    interface PageData {}

    interface Platform {
      env: {
        DB: D1Database;
        APPS: R2Bucket;
        // R2 bucket for icons/splashes/SDK assets. Renamed from ASSETS
        // because SvelteKit's adapter-cloudflare claims `ASSETS` for its
        // static-content fetcher.
        PLATFORM_ASSETS: R2Bucket;
        // SvelteKit static asset fetcher (Workers Assets binding,
        // declared via [assets] in wrangler.toml).
        ASSETS: { fetch: typeof fetch };
        CACHE: KVNamespace;
        // SIGNAL_ROOM lands in Phase 6 alongside the proximity DO port.
        SIGNAL_ROOM?: DurableObjectNamespace;
        SHIPPIE_ENV: string;
        PUBLIC_ORIGIN: string;
        // Phase 3 secrets — set via `wrangler secret put`.
        GITHUB_CLIENT_ID?: string;
        GITHUB_CLIENT_SECRET?: string;
        GOOGLE_CLIENT_ID?: string;
        GOOGLE_CLIENT_SECRET?: string;
        AUTH_SECRET?: string;
        RESEND_API_KEY?: string;
        AUTH_EMAIL_FROM?: string;
      };
      cf: CfProperties;
      ctx: ExecutionContext;
    }
  }
}

export {};
