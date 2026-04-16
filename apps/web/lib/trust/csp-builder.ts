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
 *   frame-ancestors 'none'            — never embeddable
 *
 * Spec v6 §9 (trust — enforced CSP).
 */

export interface BuildCspInput {
  /** Declared allowed connect domains from shippie.json.permissions. */
  allowedConnectDomains?: readonly string[];
  /** Domains the scanner found in actual code (not user-declared). */
  discoveredDomains?: readonly string[];
  /** External network permission — required for any non-self connect-src entry. */
  externalNetworkEnabled?: boolean;
}

export interface BuildCspResult {
  header: string;
  metaTag: string;
  connectSrc: string[];
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

  const directives: Record<string, string> = {
    'default-src': "'self'",
    'script-src': "'self' 'unsafe-inline' 'unsafe-eval'",
    'style-src': "'self' 'unsafe-inline'",
    'img-src': "'self' data: https: blob:",
    'font-src': "'self' data:",
    'connect-src': connectSrc.join(' '),
    'frame-ancestors': "'none'",
    'base-uri': "'self'",
    'form-action': "'self'",
  };

  const header = Object.entries(directives)
    .map(([k, v]) => `${k} ${v}`)
    .join('; ');

  const metaTag = `<meta http-equiv="Content-Security-Policy" content="${header.replace(/"/g, '&quot;')}">`;

  return { header, metaTag, connectSrc, reason };
}
