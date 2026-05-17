import { createShippieIframeSdk, type ShippieIframeSdk } from '@shippie/iframe-sdk';

let sdk: ShippieIframeSdk | null = null;

function getSdk(): ShippieIframeSdk {
  if (!sdk) sdk = createShippieIframeSdk({ appId: 'app_atlas' });
  return sdk;
}

export type AtlasIntent = 'trip-started' | 'stop-pinned' | 'trip-ended';

export function emitIntent(intent: AtlasIntent, row: Record<string, unknown>): void {
  try {
    getSdk().intent.broadcast(intent, [row]);
  } catch {
    /* iframe sdk no-ops outside the container */
  }
}
