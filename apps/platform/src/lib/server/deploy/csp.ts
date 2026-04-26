/**
 * CSP header builder for static deploys.
 *
 * Trimmed port of apps/web/lib/trust/csp-builder.ts. Generates a CSP
 * header line + a meta tag that gets injected into every HTML file.
 *
 * Rules:
 *   - default-src 'self'
 *   - script-src  'self' 'unsafe-inline' (for hashed bundles + inline boot)
 *   - style-src   'self' 'unsafe-inline'
 *   - connect-src 'self' + allowed_connect_domains (when external_network on)
 *   - img-src     'self' data: blob: https: (broad — favicons + remote)
 *   - frame-src   'self' https: (broad — typical embed needs)
 */

import type { ShippieJsonLite } from './manifest';

export interface CspResult {
  /** Full HTTP header value, e.g. "default-src 'self'; ..." */
  header: string;
  /** Inline `<meta http-equiv="Content-Security-Policy">` element. */
  metaTag: string;
}

export function buildCsp(manifest: ShippieJsonLite): CspResult {
  const externalAllowed = manifest.permissions?.external_network === true;
  const connectDomains = externalAllowed ? manifest.allowed_connect_domains ?? [] : [];

  const directives: Array<[string, string]> = [
    ["default-src", "'self'"],
    ["script-src", "'self' 'unsafe-inline'"],
    ["style-src", "'self' 'unsafe-inline'"],
    ["img-src", "'self' data: blob: https:"],
    ["font-src", "'self' data: https:"],
    ["frame-src", "'self' https:"],
    [
      "connect-src",
      ["'self'", ...connectDomains.map((d) => formatConnectSrcEntry(d))].join(' '),
    ],
    ["worker-src", "'self' blob:"],
    ["manifest-src", "'self'"],
  ];

  const header = directives.map(([k, v]) => `${k} ${v}`).join('; ');
  const metaTag = `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(header)}">`;

  return { header, metaTag };
}

function formatConnectSrcEntry(domain: string): string {
  // Hostnames get `https://` prefix unless they already have a scheme.
  if (/^https?:\/\//i.test(domain)) return domain;
  if (domain.startsWith('*.')) return `https://${domain}`;
  return `https://${domain}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
