/**
 * Arcade Content-Security-Policy.
 *
 * Used in two places:
 *   1. Bake time — `prepare-showcases.mjs` injects a `<meta
 *      http-equiv="Content-Security-Policy">` into each
 *      `surface: 'arcade'` first-party showcase's `index.html` so the
 *      browser enforces the policy even when the bundle is opened
 *      offline / in dev / via direct file open.
 *   2. Runtime — `hooks.server.ts` `runtimeAssetTarget()` wraps the
 *      `assets.fetch()` response for first-party arcade slugs with
 *      this same string as a `Content-Security-Policy` HTTP header.
 *      Both layers active for defence-in-depth.
 *
 * Pure module — no `$lib` imports — so the Bun-driven
 * `prepare-showcases.mjs` script can import it via relative path.
 *
 * **What this allows + denies:**
 * - allows same-origin script + worker (so Stockfish.wasm + canvas
 *   game loops run)
 * - allows `'wasm-unsafe-eval'` for WebAssembly compilation
 * - allows blob: workers (Stockfish creates one)
 * - allows wss:// to shippie.app + *.shippie.app (proximity rendezvous
 *   uses same-origin `/__shippie/signal/[roomId]`)
 * - denies third-party CDN, payments, ads, trackers — they're simply
 *   not in any allow-list
 * - denies inline scripts and `eval` — gameplay code must be bundled
 * - denies frames + objects + base — no smuggling extra hosts in
 *
 * Style allows `'unsafe-inline'` because the showcase apps' bundlers
 * commonly inject style tags. Reassess after Phase 1 if any game
 * style payload looks risky.
 */

const DIRECTIVES: ReadonlyArray<readonly [string, string]> = [
  ['default-src', "'self'"],
  ['script-src', "'self' 'wasm-unsafe-eval'"],
  ['worker-src', "'self' blob:"],
  ['connect-src', "'self' wss://shippie.app wss://*.shippie.app"],
  ['img-src', "'self' data: blob:"],
  ['media-src', "'self' data: blob:"],
  ['font-src', "'self' data:"],
  ['style-src', "'self' 'unsafe-inline'"],
  ['frame-src', "'none'"],
  ['object-src', "'none'"],
  ['base-uri', "'none'"],
  ['form-action', "'self'"],
];

/**
 * Build the canonical arcade CSP string. Stable output (joined with
 * `; `) so HTTP header + meta tag emit byte-identical text.
 */
export function buildArcadeCsp(): string {
  return DIRECTIVES.map(([k, v]) => `${k} ${v}`).join('; ');
}

/**
 * Build the `<meta>` tag form for injection into a baked
 * `index.html`. Always include the trailing semicolon-free form so
 * the bake idempotency check (don't re-inject if already present) can
 * grep for the directive prefix.
 */
export function buildArcadeCspMetaTag(): string {
  return `<meta http-equiv="Content-Security-Policy" content="${buildArcadeCsp()}">`;
}

/**
 * Marker comment we emit alongside the meta tag so the bake step can
 * detect prior injection without re-parsing the CSP. Lets us run
 * `prepare-showcases.mjs` repeatedly without growing the head.
 */
export const ARCADE_CSP_INJECTION_MARKER = '<!-- shippie-arcade-csp v1 -->';
