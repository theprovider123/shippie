/**
 * Worker environment binding contract.
 *
 * Both runtimes (Cloudflare Workers + local Bun dev server) produce an
 * object of this shape and pass it into the Hono app. This keeps the
 * router 100% portable.
 *
 * Spec v6 §2.1, §6.3.
 */
import type { KvStore, R2Store } from '@shippie/dev-storage';

export interface WorkerEnv {
  /** "production" | "development" */
  SHIPPIE_ENV: string;

  /**
   * Platform API base URL.
   *   prod:  https://shippie.app
   *   dev:   http://localhost:4100
   */
  PLATFORM_API_URL: string;

  /**
   * HMAC secret shared with the platform for signing
   * Worker → Platform /api/internal/* requests.
   *
   * Spec v6 §6.3.
   */
  WORKER_PLATFORM_SECRET: string;

  /**
   * App configuration KV (apps:{slug}:meta, apps:{slug}:active, etc.).
   * In dev this is a filesystem-backed Map adapter.
   */
  APP_CONFIG: KvStore;

  /**
   * R2 bucket for built maker app files (shippie-apps/{slug}/v{version}/*).
   * In dev this is a filesystem-backed adapter under .shippie-dev-state/r2/.
   */
  SHIPPIE_APPS: R2Store;

  /**
   * R2 bucket for public assets (icons, screenshots, SDK, OG cards).
   */
  SHIPPIE_PUBLIC: R2Store;

  /**
   * HMAC secret for signing invite-grant cookies (private apps).
   * Shared with the control plane; set via `wrangler secret put INVITE_SECRET`.
   *
   * Spec: docs/superpowers/plans/2026-04-23-private-apps-and-invites.md §Task 0
   */
  INVITE_SECRET: string;
}
