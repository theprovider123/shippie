/**
 * @shippie/sdk — client SDK for Shippie apps.
 *
 * BYO backend model: auth/db/files delegate to the maker's own backend
 * (Supabase, Firebase) via a configured adapter. feedback/analytics/
 * install/meta still route through the same-origin /__shippie/* paths
 * on the Shippie Worker.
 *
 * Three consumption modes:
 *   1. npm import:
 *        import { shippie } from '@shippie/sdk'
 *        shippie.configure({ backend: 'supabase', client: mySupabase })
 *
 *   2. Same-origin script tag (injected by the platform):
 *        <script src="/__shippie/sdk.js" async></script>
 *        // worker injects window.__shippie_meta with backend info
 *        // maker must still include their backend SDK + call configure()
 *
 *   3. CDN script tag:
 *        <script src="https://cdn.shippie.app/sdk/v2.latest.js" async></script>
 *
 * Spec v5 §2 (BYO backend).
 */
import * as authApi from './auth.ts';
import * as dbApi from './db.ts';
import * as filesApi from './files.ts';
import * as feedbackApi from './feedback.ts';
import * as installApi from './install.ts';
import * as nativeApi from './native/index.ts';
import { meta } from './meta.ts';
import { track, flush } from './analytics.ts';
import { configure, isConfigured, getBackendMeta } from './configure.ts';

export const shippie = {
  version: '2.0.0' as const,

  /** Configure the SDK with a BYO backend (Supabase, Firebase). */
  configure,

  /** Check whether a backend has been configured. */
  isConfigured,

  /** Read backend metadata injected by the worker (script-tag path). */
  getBackendMeta,

  auth: {
    getUser: authApi.getUser,
    signIn: authApi.signIn,
    signOut: authApi.signOut,
    onChange: authApi.onChange,
    getToken: authApi.getToken,
  },

  db: {
    set: dbApi.set,
    get: dbApi.getItem,
    list: dbApi.list,
    delete: dbApi.remove,
  },

  files: {
    upload: filesApi.upload,
    get: filesApi.getFile,
    delete: filesApi.remove,
  },

  feedback: {
    open: feedbackApi.open,
    submit: feedbackApi.submit,
  },

  install: {
    status: installApi.status,
    prompt: installApi.prompt,
    instructions: installApi.instructions,
  },

  native: {
    share: nativeApi.share,
    haptics: nativeApi.haptics,
    deviceInfo: nativeApi.deviceInfo,
    clipboard: nativeApi.clipboard,
    appState: nativeApi.appState,
    notifications: nativeApi.notifications,
    appReview: nativeApi.appReview,
    deepLink: nativeApi.deepLink,
    isInCapacitor: nativeApi.isInCapacitor,
  },

  track,
  flush,
  meta,
};

export default shippie;

// Side effect: expose on window when the bundle loads in a browser.
if (typeof window !== 'undefined') {
  (window as unknown as { shippie?: typeof shippie }).shippie = shippie;
}

export type { ConfigureOptions } from './configure.ts';
export type { BackendAdapter, BackendUser } from './backends/types.ts';
export type * from './types.ts';

export { shippieFooter } from './footer.ts';
export type { ShippieFooterOptions } from './footer.ts';
