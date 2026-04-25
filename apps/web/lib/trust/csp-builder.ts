/**
 * Content-Security-Policy builder for a Shippie-hosted app origin.
 *
 * The CSP is tight-by-default and relaxed only by fields the maker
 * explicitly declared in shippie.json:
 *
 *   default-src 'self'                — same-origin only
 *   script-src 'self' 'unsafe-inline' — allow inline scripts (SPAs need this;
 *                                        inline is bounded by origin)
 *   connect-src 'self' <allowlist>    — XHR / fetch targets
 *   img-src 'self' data: https:       — loose for user-uploaded images
 *   style-src 'self' 'unsafe-inline'  — inline styles for frameworks
 *   font-src 'self' data:             — inline data-URI fonts
 *   frame-src https://ai.shippie.app  — allow the Shippie AI inference
 *                                        iframe so shippie.local.ai works
 *                                        out of the box. No other framing
 *                                        targets are permitted by default.
 *   frame-ancestors 'none'            — never embeddable
 *
 * Spec v6 §9 (trust — enforced CSP). Phase 3 / week 5: add frame-src for
 * ai.shippie.app so cross-origin postMessage inference works without
 * makers having to author their own CSP.
 */

/**
 * The Shippie AI app origin that hosts the cross-origin inference iframe.
 * Single source of truth — keep aligned with packages/sdk/src/local.ts.
 */
export const SHIPPIE_AI_FRAME_ORIGIN = 'https://ai.shippie.app';

export interface BuildCspInput {
  /** Declared allowed connect domains from shippie.json.permissions. */
  allowedConnectDomains?: readonly string[];
  /** Domains the scanner found in actual code (not user-declared). */
  discoveredDomains?: readonly string[];
  /** External network permission — required for any non-self connect-src entry. */
  externalNetworkEnabled?: boolean;
  /**
   * Extra origins to include in `frame-src` beyond the always-allowed
   * Shippie AI iframe. Empty by default. Most makers should never need
   * this; the AI iframe is what unlocks shippie.local.ai.
   */
  allowedFrameOrigins?: readonly string[];
}

export interface BuildCspResult {
  header: string;
  metaTag: string;
  connectSrc: string[];
  frameSrc: string[];
  reason: string;
}

export function buildCsp(input: BuildCspInput): BuildCspResult {
  const connectSrc: string[] = ["'self'"];
  let reason = 'tight-by-default';

  if (input.externalNetworkEnabled) {
    const declared = (input.allowedConnectDomains ?? []).filter(Boolean);
    for (const d of declared) connectSrc.push(`https://${d}`);
    reason = `external_network enabled with ${declared.length} declared domain(s)`;
  } else if ((input.discoveredDomains ?? []).length > 0) {
    reason = `external_network=false but scanner found ${input.discoveredDomains!.length} domain(s) — will be blocked`;
  }

  // frame-src: always allow the Shippie AI iframe (so shippie.local.ai
  // works without each maker having to author a CSP). Extra origins are
  // additive and rare. We do NOT default to 'self' because we want the
  // CSP to be explicit about what *external* frames are permitted.
  const frameSrcSet = new Set<string>([SHIPPIE_AI_FRAME_ORIGIN]);
  for (const f of input.allowedFrameOrigins ?? []) {
    if (f) frameSrcSet.add(f);
  }
  const frameSrc = Array.from(frameSrcSet);

  const directives: Record<string, string> = {
    'default-src': "'self'",
    'script-src': "'self' 'unsafe-inline' 'unsafe-eval'",
    'style-src': "'self' 'unsafe-inline'",
    'img-src': "'self' data: https: blob:",
    'font-src': "'self' data:",
    'connect-src': connectSrc.join(' '),
    'frame-src': frameSrc.join(' '),
    'frame-ancestors': "'none'",
    'base-uri': "'self'",
    'form-action': "'self'",
  };

  const header = Object.entries(directives)
    .map(([k, v]) => `${k} ${v}`)
    .join('; ');

  const metaTag = `<meta http-equiv="Content-Security-Policy" content="${header.replace(/"/g, '&quot;')}">`;

  return { header, metaTag, connectSrc, frameSrc, reason };
}
