// apps/web/app/components/install-runtime.tsx
/**
 * Marketplace-side host for the `@shippie/sdk/wrapper` install runtime.
 *
 * All logic lives in the shared `startInstallRuntime()` helper — this
 * component just mounts it on the client with a marketplace-specific
 * `trackEndpoint`. Maker apps load the same runtime via the IIFE bundle
 * at `/__shippie/sdk.js` with the default endpoint.
 *
 * SSR-safe: returns `null` and only boots inside `useEffect`.
 */
'use client';

import { useEffect } from 'react';
import { startInstallRuntime } from '@shippie/sdk/wrapper';

/**
 * Marketplace-side endpoint. The control plane handles the beacon in
 * `apps/web/app/api/shippie/install/route.ts`; maker apps use the
 * default `/__shippie/install` route served by the Worker.
 */
const MARKETPLACE_TRACK_ENDPOINT = '/api/shippie/install';

export function InstallRuntime() {
  useEffect(() => {
    const cleanup = startInstallRuntime({
      trackEndpoint: MARKETPLACE_TRACK_ENDPOINT,
    });
    return cleanup;
  }, []);

  return null;
}
