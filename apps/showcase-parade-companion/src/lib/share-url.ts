import { DEFAULT_PACK_ID, resolvePackId } from './route-pack';

export interface ShareRunUrlOptions {
  fragment?: string;
  packId?: string;
}

const CANONICAL_RUN_ORIGIN = 'https://shippie.app';

/**
 * Build a shareable `/run/parade-companion/` URL.
 *
 * Localhost links are poison for a real phone scan: the second phone opens
 * its own loopback address and never reaches the invite. During development
 * we still generate the canonical Shippie URL so cross-device QR tests behave
 * like parade-day scans.
 */
export function buildShareRunUrl(options: ShareRunUrlOptions = {}): string {
  const origin = shareOrigin();
  const url = new URL('/run/parade-companion/', origin);
  const packId = options.packId ?? resolvePackId();
  if (packId && packId !== DEFAULT_PACK_ID) url.searchParams.set('pack', packId);
  const fragment = cleanFragment(options.fragment ?? '');
  if (fragment) url.hash = fragment;
  return url.toString();
}

export function shareOrigin(): string {
  if (typeof window === 'undefined') return CANONICAL_RUN_ORIGIN;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') {
    return CANONICAL_RUN_ORIGIN;
  }
  return window.location.origin;
}

function cleanFragment(fragment: string): string {
  return fragment.trim().replace(/^#/, '');
}
