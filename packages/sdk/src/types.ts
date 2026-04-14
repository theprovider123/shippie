/**
 * Shippie SDK public types.
 *
 * These are the contracts between maker code and the same-origin
 * __shippie/* runtime. They're intentionally minimal and stable — the
 * SDK bundle ships as a single versioned file served from
 * cdn.shippie.app/sdk/v{major}.latest.js.
 *
 * Spec v6 §7 (SDK design).
 */

export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

export interface AppMeta {
  slug: string;
  name: string;
  type: 'app' | 'web_app' | 'website';
  theme_color: string;
  background_color: string;
  version: number;
  permissions: {
    auth: boolean;
    storage: 'none' | 'r' | 'rw';
    files: boolean;
    notifications: boolean;
    analytics: boolean;
    native_bridge?: string[];
  };
}

export interface DbSetOptions {
  /** If true, the row lands in the public partial index (no user_id). */
  public?: boolean;
}

export interface DbListOptions {
  public?: boolean;
  limit?: number;
  offset?: number;
}

export interface FileUploadResult {
  url: string;
  key: string;
}

export interface FeedbackItem {
  type: 'comment' | 'bug' | 'request' | 'rating' | 'praise';
  title?: string;
  body?: string;
  rating?: number;
  dimensions?: Record<string, number>;
  reproSteps?: string;
  screenshotKey?: string;
}

export type InstallStatus = 'installed' | 'installable' | 'unsupported';

export interface TrackOptions {
  /**
   * Only effective when the app declared
   * `compliance.identifiable_analytics: true` in shippie.json.
   * Setting true without the manifest flag is a no-op + console warning.
   *
   * Spec v6 §14 (Fix v5.1.2 I identifiable_analytics enforcement).
   */
  identify?: boolean;
}
