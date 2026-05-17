/**
 * Intent emission — talks to the Shippie container shell via the
 * iframe SDK. Care Log publishes 3 intents:
 *   - care-dose-given
 *   - care-symptom-noted
 *   - care-handover-noted
 *
 * Care Log does NOT consume any external intent — the cared-for
 * person's data is held by the caregivers, not pulled from siblings.
 * Symptom Diary is for a person tracking their OWN condition; Care
 * Log is for someone else's. They don't share a stream.
 */
import { createShippieIframeSdk, type ShippieIframeSdk } from '@shippie/iframe-sdk';

let sdk: ShippieIframeSdk | null = null;

function getSdk(): ShippieIframeSdk {
  if (!sdk) sdk = createShippieIframeSdk({ appId: 'app_care_log' });
  return sdk;
}

export type CareIntent =
  | 'care-dose-given'
  | 'care-symptom-noted'
  | 'care-handover-noted';

export function emitIntent(intent: CareIntent, row: Record<string, unknown>): void {
  try {
    getSdk().intent.broadcast(intent, [row]);
  } catch {
    // Swallow — the iframe sdk gracefully no-ops outside the container.
  }
}
