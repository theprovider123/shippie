// packages/sdk/src/wrapper/iab-bounce.ts
/**
 * IAB bounce: build a URL that tries to open the current page in the
 * platform's default browser (Safari on iOS, Chrome on Android) instead
 * of the in-app WebView where install cannot happen.
 *
 * iOS: `x-safari-https://<host><path>` — non-standard scheme, works in
 *      some (not all) in-app browsers. We always upgrade http→https since
 *      every Shippie subdomain has SSL.
 *
 * Android: `intent://<host><path>?<query>#Intent;scheme=https;package=com.android.chrome;end`
 *          — standard Android intent URI, well-supported by IABs that
 *          honor intent:// links.
 *
 * Hash fragments are dropped on Android because `#` separates the
 * intent fragment from the URL fragment and reconstructing them is
 * fragile. Callers that need hash preservation should pass it via a
 * query param.
 *
 * Spec §5.1.
 */
import type { Platform } from './detect.ts';

export type BounceScheme = 'x-safari-https' | 'intent';

export interface BounceInput {
  platform: Platform;
  currentUrl: string;
}

export interface BounceTarget {
  scheme: BounceScheme;
  url: string;
}

export function buildBounceTarget(input: BounceInput): BounceTarget | null {
  const { platform, currentUrl } = input;

  if (platform === 'ios') {
    const stripped = currentUrl.replace(/^https?:\/\//, '');
    return {
      scheme: 'x-safari-https',
      url: `x-safari-https://${stripped}`,
    };
  }

  if (platform === 'android') {
    const withoutScheme = currentUrl.replace(/^https?:\/\//, '');
    const withoutHash = withoutScheme.split('#')[0] ?? withoutScheme;
    return {
      scheme: 'intent',
      url: `intent://${withoutHash}#Intent;scheme=https;package=com.android.chrome;end`,
    };
  }

  return null;
}
