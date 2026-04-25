/**
 * Thin wrapper over `shippie.device.scanBarcode()`. Android-only — silently
 * absent on iOS and desktop. UI should hide the button when `isAvailable`
 * returns false.
 */

export interface ShippieDevice {
  scanBarcode?: () => Promise<string | null>;
}

interface ShippieGlobalForScan {
  device?: ShippieDevice;
}

export function isAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const shippie = (window as unknown as { shippie?: ShippieGlobalForScan }).shippie;
  return typeof shippie?.device?.scanBarcode === 'function';
}

export async function scanBarcode(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const shippie = (window as unknown as { shippie?: ShippieGlobalForScan }).shippie;
  if (typeof shippie?.device?.scanBarcode !== 'function') return null;
  return shippie.device.scanBarcode();
}
