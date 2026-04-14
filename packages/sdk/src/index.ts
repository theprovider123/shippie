/**
 * @shippie/sdk — same-origin client SDK for Shippie runtime apps.
 *
 * Three consumption modes:
 *   1. npm import:
 *        import { shippie } from '@shippie/sdk'
 *        await shippie.auth.signIn()
 *
 *   2. Same-origin script tag (injected by the platform into every deploy):
 *        <script src="/__shippie/sdk.js" async></script>
 *        // then: window.shippie.auth.signIn()
 *
 *   3. CDN script tag (for makers who want explicit pinning):
 *        <script src="https://cdn.shippie.app/sdk/v1.latest.js" async></script>
 *
 * Spec v6 §7.
 */
import * as authApi from './auth.ts';
import * as dbApi from './db.ts';
import * as filesApi from './files.ts';
import * as feedbackApi from './feedback.ts';
import * as installApi from './install.ts';
import * as nativeApi from './native/index.ts';
import { meta } from './meta.ts';
import { track, flush } from './analytics.ts';

export const shippie = {
  version: '0.0.1' as const,

  auth: {
    getUser: authApi.getUser,
    signIn: authApi.signIn,
    signOut: authApi.signOut,
    onChange: authApi.onChange,
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

export type * from './types.ts';
