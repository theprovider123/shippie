/**
 * Trust Ledger runtime CSP.
 *
 * Applied at HTTP response time to every Shippie-controlled showcase
 * runtime (`/__shippie-run/<slug>/...`). Restricts outbound fetch to
 * bridge-mediated paths so the ledger's egress accounting is honest
 * for these iframes.
 *
 * Spec: docs/superpowers/specs/2026-05-30-trust-ledger-5a-design.md §9.
 *
 * IMPORTANT: CSP applies only to the response Shippie serves. For
 * URL-installed / custom-domain apps where `runtime-src.ts` returns
 * an absolute external URL, this header never reaches the iframe —
 * those apps are flagged `egress_visibility: 'bridge-only'` in the
 * Trust Ledger header and the gap is acknowledged in spec §9.3.
 *
 * iframe `sandbox` is NOT a "no arbitrary network" switch on its own;
 * the load-bearing primitives are CSP + the bridge `network.fetch`
 * capability gate.
 */

const DIRECTIVES: ReadonlyArray<readonly [string, string]> = [
  ['default-src', "'self'"],
  ['script-src', "'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'"],
  ['worker-src', "'self' blob:"],
  ['style-src', "'self' 'unsafe-inline' https://fonts.googleapis.com"],
  ['font-src', "'self' data: https://fonts.gstatic.com"],
  ['img-src', "'self' data: blob: https:"],
  ['media-src', "'self' data: blob:"],
  // connect-src is the load-bearing restriction. Bridge-mediated
  // paths (/__shippie/proxy, /__esm/*) are same-origin under 'self'.
  // wss:// to shippie.app + subdomains covers SignalRoom rendezvous.
  // No arbitrary external hosts are allowed; showcases that need
  // external data declare it through the maker manifest and go via
  // /__shippie/proxy, which is logged as a `network.fetch` row.
  ['connect-src', "'self' wss://shippie.app wss://*.shippie.app"],
  ['frame-src', "'self'"],
  ['frame-ancestors', "'self' https://shippie.app https://*.shippie.app"],
  ['object-src', "'none'"],
  ['base-uri', "'none'"],
  ['form-action', "'self'"],
];

export function buildShippieRuntimeCsp(): string {
  return DIRECTIVES.map(([k, v]) => `${k} ${v}`).join('; ');
}

/**
 * Wrap an assets.fetch() response with the runtime CSP header for
 * Shippie-controlled showcase runtimes. Preserves status, headers,
 * and body stream — never re-encodes or buffers.
 *
 * Returns the original response unchanged if a CSP is already set
 * (e.g. arcade bake-time meta tag or arcade runtime layer).
 */
export function withShippieRuntimeCsp(response: Response): Response {
  if (!response.ok) return response;
  const existing = response.headers.get('content-security-policy');
  if (existing) return response;
  const headers = new Headers(response.headers);
  headers.set('content-security-policy', buildShippieRuntimeCsp());
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * For tests and the lint that asserts directives are present.
 */
export function parseDirectives(csp: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const segment of csp.split(';')) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const [name, ...rest] = trimmed.split(/\s+/);
    if (!name) continue;
    out.set(name, rest.join(' '));
  }
  return out;
}
