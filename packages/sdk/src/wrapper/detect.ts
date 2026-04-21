// packages/sdk/src/wrapper/detect.ts
/**
 * UA detection for the wrapper runtime.
 *
 * Three independent signals:
 *   1. Platform: ios / android / desktop
 *   2. Install method: what the user would have to do to install this PWA
 *   3. IAB: which in-app browser (if any) the user is trapped in
 *
 * Strings are matched case-sensitively against common public UA fragments.
 * Quarterly review required — see spec §5.1.
 */
export type Platform = 'ios' | 'android' | 'desktop';

export type InstallMethod =
  | 'one-tap'      // Android beforeinstallprompt available
  | 'ios-safari'   // iOS Safari — Share → Add to Home Screen
  | 'ios-chrome'   // iOS Chrome (CriOS) — ⋯ → Add to Home Screen
  | 'ios-other'    // iOS non-Safari/Chrome (Firefox FxiOS, Opera OPiOS, Edge EdgiOS, etc.)
  | 'manual';      // everything else

export type IabBrand =
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'twitter'
  | 'linkedin'
  | 'snapchat'
  | 'pinterest'
  | 'whatsapp'
  | 'wechat'
  | 'line';

export interface InstallContext {
  platform: Platform;
  method: InstallMethod;
  iab: IabBrand | null;
  standalone: boolean;
}

export function detectPlatform(ua: string): Platform {
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/**
 * Classify how the user would install a PWA from this browser.
 *
 * This detector is intentionally independent of `detectIab` — if the
 * user is in Instagram's WebView on iPhone, this still returns
 * `'ios-safari'` because that describes the host browser family.
 * Callers in the smart-prompt state machine are responsible for
 * checking `detectIab` first and suppressing the install prompt
 * when the user is trapped in an IAB. Keeping these signals
 * independent makes each testable on its own.
 *
 * iOS sub-classification requires a **positive Safari signal** to
 * return `ios-safari` — genuine iOS Safari UAs always include
 * `Version/N … Safari/N`. Unknown iOS browsers (Google Search App,
 * DuckDuckGo, Brave, Arc, Orion…) fall back to `ios-other` so users
 * see generic browser-menu guidance rather than Share→Add-to-Home
 * instructions that only work in Safari.
 */
export function detectInstallMethod(ua: string): InstallMethod {
  if (/iPhone|iPad|iPod/.test(ua)) {
    if (/CriOS/.test(ua)) return 'ios-chrome';
    if (/FxiOS|OPiOS|EdgiOS/.test(ua)) return 'ios-other';
    if (/Version\/\d+[^ ]* Mobile\/[^ ]+ Safari\//.test(ua)) return 'ios-safari';
    return 'ios-other';
  }
  // Android + desktop start as 'manual' and are promoted to 'one-tap'
  // when the wrapper runtime sees the `beforeinstallprompt` event.
  return 'manual';
}

interface IabPattern {
  brand: IabBrand;
  pattern: RegExp;
}

const IAB_PATTERNS: readonly IabPattern[] = [
  { brand: 'instagram', pattern: /Instagram/ },
  { brand: 'facebook', pattern: /FBAN|FBAV|FB_IAB|FBIOS/ },
  { brand: 'tiktok', pattern: /musical_ly|TikTok|trill_/ },
  { brand: 'twitter', pattern: /Twitter for|TwitterAndroid/ },
  { brand: 'linkedin', pattern: /LinkedInApp/ },
  { brand: 'snapchat', pattern: /Snapchat/ },
  { brand: 'pinterest', pattern: /Pinterest/ },
  { brand: 'whatsapp', pattern: /WhatsApp/ },
  { brand: 'wechat', pattern: /MicroMessenger/ },
  { brand: 'line', pattern: /Line\/|LIFF/ },
];

export function detectIab(ua: string): IabBrand | null {
  for (const { brand, pattern } of IAB_PATTERNS) {
    if (pattern.test(ua)) return brand;
  }
  return null;
}

export function detectStandalone(
  nav: { standalone?: boolean },
  match: (query: string) => { matches: boolean },
): boolean {
  // iOS Safari exposes `navigator.standalone` as a boolean
  if (nav.standalone === true) return true;
  // Everyone else uses the display-mode media query
  return match('(display-mode: standalone)').matches;
}

/**
 * Convenience: read everything the runtime needs in one call.
 * Pass `nav` and `mm` so tests can inject fakes.
 */
export function readInstallContext(
  ua: string,
  nav: { standalone?: boolean },
  mm: (q: string) => { matches: boolean },
): InstallContext {
  return {
    platform: detectPlatform(ua),
    method: detectInstallMethod(ua),
    iab: detectIab(ua),
    standalone: detectStandalone(nav, mm),
  };
}
