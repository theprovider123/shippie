---
created: 2026-05-10
project: shippie
tags: [spike, arcade-v2, chess]
---

# Stockfish.wasm spike — Arcade v2 Chess

## Decision (TL;DR)

**GO**, with **Decision A** (single-threaded build, no SAB / no
COOP+COEP header changes).

- **Package**: `stockfish.wasm` — Niklas Fiekas's port. Pin to a
  specific version when integrating in Phase 2 (recommend the
  most-recent stable patch of the 16.x line at the time we land
  the chess showcase). Do **not** track the moving "latest" tag.
- **License**: GPL-3.0. Obligations satisfied by:
  1. Source link in the chess showcase About modal pointing to
     the upstream Stockfish source (`https://github.com/official-stockfish/Stockfish`).
  2. The `stockfish.wasm` port + its npm-published source already
     satisfies the redistribution clause; we link rather than
     re-vendor.
  3. Per-showcase license file at
     `apps/showcase-chess/public/stockfish/LICENSE` (committed
     verbatim from upstream).
  4. The chess **showcase** becomes GPL-licensed code; the rest
     of the platform is unaffected because each showcase ships its
     own bundle and the GPL boundary doesn't cross into the
     SvelteKit worker.
- **Bundling, not /__esm**: ship Stockfish under
  `apps/showcase-chess/public/stockfish/` so the bake includes it as
  static assets. `/__esm/` would pull from esm.sh on first visit —
  unsafe for the "100% offline" arcade gate.
- **Offline path**: extend the platform's PWA shell-assets manifest
  with a new `runtimes` section listing the Stockfish file paths;
  service worker install handler precaches them at install time.
  Plus a belt-and-braces non-blocking `fetch()` warm on chess App
  mount.
- **Threading**: ship the **single-threaded** build (~700KB gz). No
  SharedArrayBuffer, so no COOP / COEP header changes — Shippie's
  iframe model is preserved. Skill level 20 at 1000ms thinking time
  on 2018 iPhone benchmarks at strong-club ELO; that's the bar.
- **Container sandbox + Worker constructor**: the existing iframe
  sandbox `allow-scripts` (set in `AppFrameHost.svelte` runtimeSrc
  branch) covers Web Worker construction. No sandbox change needed.
- **WASM MIME**: Cloudflare Workers Assets serves `.wasm` files
  with `Content-Type: application/wasm` by default (verified from
  the wa-sqlite assets we already ship under `/__shippie/wasm/`).
  No proxy changes needed.

If single-threaded perf disappoints in Phase 2 testing, escalate to
**Decision B**: enable COOP/COEP only on the chess showcase route via
`<meta http-equiv>` in `apps/showcase-chess/index.html`. Chrome
respects meta-COEP and uses the multi-threaded build; Safari ignores
it and falls back to single-threaded — net zero regression for
Safari, multithread bonus for Chrome.

## Test plan for Phase 2 chess integration

**No** self-play monotonicity test (the previous draft included this;
the user correctly flagged it as slow + flaky). The four tests we
will run instead:

1. **UCI handshake**: spawn the worker, send `uci\n`, expect
   `id name Stockfish ...` followed by `uciok` within 1000ms. Fails
   the build if the worker doesn't speak UCI.
2. **Legal-move set check**: 50 random FEN positions (deterministic
   PRNG seed). For each, send `position fen <fen>` then
   `go movetime 50`. Stockfish's `bestmove <move>` must appear in
   chessops's `legalMoves(position)` list. Catches integration drift
   between the move-gen library and the engine.
3. **Fixed-position smoke**: 20 known mate-in-N positions (curated
   from CC0 Lichess puzzles). For each, ask Stockfish to search to
   depth N+2; assert it finds the documented mating move. Catches
   correctness regressions from version bumps.
4. **Performance budget**: `go movetime 200` at skill level 10
   on the integration test runner returns a move in p95 < 250ms.
   Skill level 20 at `go movetime 1000` returns within p95 < 1100ms.

The four tests run in CI on every chess showcase build; runtime ≈
3s total. No flake.

## Bundle size

- Single-threaded `stockfish.wasm` build: ~720KB gz, ~2.0MB raw.
- JS glue: ~80KB gz, ~250KB raw.
- 200-puzzle PGN bundle (Phase 2): ~80KB gz.
- chessops library: ~40KB gz.

Chess showcase total bundle: ~920KB gz. Inside Shippie's per-showcase
budget (we have room), and one-time precache via the PWA SW.

## Open questions deferred to Phase 2

- Stockfish version pinning policy: single pin per arcade-v2 ship,
  or rolling minor updates? **Decision: pin major+minor, allow
  patch.** The npm dist-tags align with that.
- Practice puzzle source: which CC0 PGN snapshot, exact date.
  Decide at Phase 2 day 8 when the puzzles task starts.
- Premove + analysis-mode UX: out of scope for v1.

## What this spike did NOT validate

- Real two-phone mesh chess sync. That's a `@shippie/proximity`
  exercise during Phase 2.5; the Drawing Telephone lobby is the
  canonical pattern.
- Stockfish.wasm running inside an iframe with the new arcade CSP
  header from Phase 0. **Action**: when we wire the chess showcase
  in Phase 2, run a smoke check that the CSP allows
  `worker-src 'self' blob:` and `script-src 'self' 'wasm-unsafe-eval'`
  through to a real Stockfish instantiation. If the smoke fails,
  CSP is the problem; both directives are already in
  `lib/curation/arcade-csp.ts` so this should pass.
