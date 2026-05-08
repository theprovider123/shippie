import { createShippieIframeSdk, type ShippieIframeSdk } from '@shippie/iframe-sdk';

let sdk: ShippieIframeSdk | null = null;

function getSdk(): ShippieIframeSdk {
  if (!sdk) sdk = createShippieIframeSdk({ appId: 'app_tab' });
  return sdk;
}

export type TabIntent = 'tab-item-added' | 'tab-settled';

export function emitIntent(intent: TabIntent, row: Record<string, unknown>): void {
  try {
    getSdk().intent.broadcast(intent, [row]);
  } catch {
    /* iframe sdk no-ops outside the container */
  }
}
