// SvelteKit ambient types — augments Locals + Platform with Cloudflare bindings.
// See wrangler.toml for the binding declarations.
//
// Phase 3: Lucia user/session types are populated by hooks.server.ts.

import type { D1Database, R2Bucket, KVNamespace, DurableObjectNamespace } from '@cloudflare/workers-types';
import type { Session } from 'lucia';
import type { AppUser, AppLucia } from '$server/auth/lucia';

type CloudflareEmailBinding = {
  send(input: {
    to: string;
    from: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
};

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
        // Sealed Document event/snapshot storage. Hubs store ciphertext
        // only; raw document keys never reach this binding.
        DOCUMENTS?: R2Bucket;
        // SvelteKit static asset fetcher (Workers Assets binding,
        // declared via [assets] in wrangler.toml).
        ASSETS: { fetch: typeof fetch };
        CACHE: KVNamespace;
        // SIGNAL_ROOM lands in Phase 6 alongside the proximity DO port.
        SIGNAL_ROOM?: DurableObjectNamespace;
        // Parade Companion crowd-sourced bus segment pulse.
        BUS_PULSE?: DurableObjectNamespace;
        // SCHOOL_WORKSPACE — Uniti Cloudlet per-school private workspace DO
        // (one DO per provisioned school instance, embedded SQLite).
        SCHOOL_WORKSPACE?: DurableObjectNamespace;
        // AI — optional Workers AI binding (Phase 5). The AIBroker gates on
        // presence: absent → the deterministic rules path is used, never a
        // crash. Add `[ai] binding = "AI"` to wrangler.toml to enable.
        AI?: { run: (model: string, input: unknown) => Promise<unknown> };
        SHIPPIE_ENV: string;
        PUBLIC_ORIGIN: string;
        // Phase 3 secrets — set via `wrangler secret put`.
        GITHUB_CLIENT_ID?: string;
        GITHUB_CLIENT_SECRET?: string;
        GOOGLE_CLIENT_ID?: string;
        GOOGLE_CLIENT_SECRET?: string;
        // Microsoft 365 / Entra ID SSO (Uniti school-domain login).
        MICROSOFT_CLIENT_ID?: string;
        MICROSOFT_CLIENT_SECRET?: string;
        MICROSOFT_TENANT?: string;
        // Hidden live demo entry for Uniti (/uniti/demo?code=...).
        // Set via `wrangler secret put UNITI_DEMO_CODE`.
        UNITI_DEMO_CODE?: string;
        FOOTBALL_DATA_TOKEN?: string;
        SEALED_DOCS_ENABLED?: string;
        SEALED_DOC_CHANGE_STREAM_ENABLED?: string;
        SEALED_DOC_DAILY_EVENT_LIMIT?: string;
        SEALED_DOC_DAILY_BYTE_LIMIT?: string;
        SEALED_DOC_IP_DAILY_EVENT_LIMIT?: string;
        SEALED_DOC_MAX_ATTACHMENT_BYTES?: string;
        SEALED_DOC_DAILY_ATTACHMENT_BYTE_LIMIT?: string;
        AUTH_SECRET?: string;
        INVITE_SECRET?: string;
        EMAIL?: CloudflareEmailBinding;
        AUTH_EMAIL_FROM?: string;
      };
      cf: CfProperties;
      ctx: ExecutionContext;
    }
  }
}

export {};
