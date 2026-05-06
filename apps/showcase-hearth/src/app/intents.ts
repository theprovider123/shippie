import { createShippieIframeSdk, type ShippieIframeSdk } from '@shippie/iframe-sdk';

let sdk: ShippieIframeSdk | null = null;

function getSdk(): ShippieIframeSdk {
  if (!sdk) sdk = createShippieIframeSdk({ appId: 'app_hearth' });
  return sdk;
}

export type HearthIntent = 'chore-done' | 'fridge-added' | 'dinner-eaten';

export function emitIntent(intent: HearthIntent, row: Record<string, unknown>): void {
  try {
    getSdk().intent.broadcast(intent, [row]);
  } catch {
    /* iframe sdk no-ops outside the container */
  }
}
