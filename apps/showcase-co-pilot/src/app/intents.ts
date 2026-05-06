/**
 * Intent emission — talks to the Shippie container shell via the
 * iframe SDK. Co-Pilot publishes 3 intents:
 *   - coparent-handover-noted
 *   - coparent-med-given
 *   - coparent-day-changed
 *
 * Co-Pilot does NOT consume any external intent (kid-side data is
 * deliberately out of scope; see VOICE.md).
 */
import { createShippieIframeSdk, type ShippieIframeSdk } from '@shippie/iframe-sdk';

let sdk: ShippieIframeSdk | null = null;

function getSdk(): ShippieIframeSdk {
  if (!sdk) sdk = createShippieIframeSdk({ appId: 'app_co_pilot' });
  return sdk;
}

export type CoParentIntent =
  | 'coparent-handover-noted'
  | 'coparent-med-given'
  | 'coparent-day-changed';

export function emitIntent(intent: CoParentIntent, row: Record<string, unknown>): void {
  try {
    getSdk().intent.broadcast(intent, [row]);
  } catch {
    // Swallow — the iframe sdk gracefully no-ops outside the container.
  }
}
