# Phase 5 export audit (audit only — no sweep before launch)

Reviewed list for the `dist → src` export cleanup (CLAUDE.md invariant: internal
workspace packages expose `src`; publishable/executable packages may keep `dist`).
**Deferred by decision** — do not execute before the reconcile lands and main is current.

## Flip `dist → src` (14 internal private packages)
`agent`, `backup-providers`, `dev-storage`, `iframe-sdk`, `local-ai`, `local-db`,
`local-files`, `local-runtime`, `local-runtime-contract`, `micro-logger`, `proximity`,
`pwa-injector`, `templates`, `trust-ledger`.

> Note: several of these (`local-runtime-contract`, `iframe-sdk`, `local-ai`) are
> open-core contract packages — flipping them to `src` removes the `tsup --clean` race
> and makes the core resolvable from source, which is exactly what the core should be.

## Keep `dist` (publishable / executable)
- `sdk` — published (MIT), exports `dist` ✓
- `cli`, `mcp-server` — already export `src` (executable; consistent, leave as-is)

## Judgment calls
- `showcase-kit-v2` — `private:false`, exports `dist`. Decide: is it published, or
  internal? If internal, flip to `src`; if published as a kit, keep `dist`.

## Deletion candidate (audit, not delete-now)
- `showcase-kit` (v1) — CLAUDE.md references only `showcase-kit-v2`. Confirm no live
  importers, then retire. Defer per "no risky pre-launch package surgery."

## Already correct (no action)
20 packages already export `src`: access, ambient, analyse, app-package-builder,
app-package-contract, container-bridge, design-tokens, doc, intelligence, intents,
juice, observations, offline-capsule, qr, session-crypto, share, shared, shippie-core,
showcase-kit, spaces.
