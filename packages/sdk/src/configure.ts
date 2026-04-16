/**
 * SDK configuration — stores the active backend adapter.
 *
 * Makers call shippie.configure() once at app startup. After that,
 * shippie.auth/db/files delegate to the adapter.
 *
 * Tier 1 (no backend): auth/db/files throw a helpful error.
 * Tier 2 (BYO): wraps the maker's initialized client.
 *
 * Spec v5 §2.
 */
import type { BackendAdapter } from './backends/types.ts';
import { createSupabaseAdapter } from './backends/supabase.ts';

let adapter: BackendAdapter | null = null;

export interface ConfigureOptions {
  backend: 'supabase' | 'firebase';
  /** An already-initialized backend client (e.g., SupabaseClient). */
  client: unknown;
}

/**
 * Configure the Shippie SDK with a BYO backend.
 *
 * @example
 * import { createClient } from '@supabase/supabase-js'
 * import { shippie } from '@shippie/sdk'
 *
 * const supabase = createClient(url, anonKey)
 * shippie.configure({ backend: 'supabase', client: supabase })
 */
export function configure(opts: ConfigureOptions): void {
  switch (opts.backend) {
    case 'supabase':
      adapter = createSupabaseAdapter(opts.client);
      break;
    case 'firebase':
      throw new Error(
        'Firebase adapter ships in a future release. Use Supabase for now, or contribute at github.com/shippie/shippie.',
      );
    default:
      throw new Error(`Unknown backend: ${opts.backend}. Supported: supabase, firebase.`);
  }
}

/**
 * Returns the active adapter. Throws if configure() hasn't been called.
 * Used internally by auth.ts, db.ts, files.ts.
 */
export function getAdapter(): BackendAdapter {
  if (!adapter) {
    throw new Error(
      'shippie.configure() has not been called. ' +
        'This app needs a backend for auth/storage/files. ' +
        'See https://docs.shippie.app/sdk/configure',
    );
  }
  return adapter;
}

/**
 * Check whether a backend is configured (for conditional UI).
 */
export function isConfigured(): boolean {
  return adapter !== null;
}

/**
 * Auto-configure from window.__shippie_meta if present (script-tag path).
 * The worker injects this metadata; the maker must still provide a client.
 * This function is called automatically on SDK load in a browser.
 */
export function getBackendMeta(): { backend_type: string | null; backend_url: string | null } {
  if (typeof window === 'undefined') return { backend_type: null, backend_url: null };
  const meta = (window as unknown as { __shippie_meta?: { backend_type?: string; backend_url?: string } }).__shippie_meta;
  return {
    backend_type: meta?.backend_type ?? null,
    backend_url: meta?.backend_url ?? null,
  };
}
