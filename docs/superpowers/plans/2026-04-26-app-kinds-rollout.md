# App Kinds Rollout — Phases 0a, 0b, 1 (and beyond)

**Date**: 2026-04-26
**Owner**: Devante
**Vocabulary doc**: [`docs/app-kinds.md`](../../app-kinds.md)
**Status**: Approved strategy. Phase 0a is doc-only and unblocks the rest.

This plan turns the **Local / Connected / Cloud** vocabulary into shipped
product. It plugs into the existing post-cloud platform code on
`apps/platform`, the existing `@shippie/analyse` AppProfile, and the
existing capability-badges pipeline.

## Goals

- Make Shippie marketplace labels honest about where each app actually runs.
- Earn user trust by proving Local/Connected claims with runtime telemetry,
  not maker declaration.
- Lay foundations for the Localize and Remix migration tools without
  requiring them to exist for launch.

## Non-goals (this rollout)

- Building Localize (source migration) — Phase 2.
- Building Remix (regenerate from intent) — Phase 3.
- Building the Shippie MCP server — Phase 4.
- Replacing the wrapper, proof system, or SDK. Phase 1 *extends* the proof
  taxonomy with kind-confirming events and adds the corresponding wrapper
  emissions, but the existing proof event spine, capability-badge merge
  logic, and SDK shape stay as they are.

## Phase 0a — Vocabulary (doc-only, ~1 day)

Already in flight via `docs/app-kinds.md`. Remaining work:

- [ ] Update `docs/CURRENT_STATE.md` to reference the three kinds and link
      to `docs/app-kinds.md`.
- [ ] Update `docs/architecture.md` to mention App Kinds in the marketplace
      section.
- [ ] Add a "copy bank" section to `docs/app-kinds.md` (or a sibling file)
      with the exact maker-facing and user-facing strings: marketplace
      blurbs per kind+status, deploy-review messages, conflict notices,
      Localize-offer copy, dispute-flow copy. Centralising the strings
      keeps the UI honest and translatable.

**Exit criteria**: anyone reading the docs can derive the kind for an app
from its source without consulting code.

## Phase 0b — Product surface (~3–5 days)

This is product code, not docs. Files to touch are pinned to HEAD.

### Types

- [ ] Add `AppKind`, `PublicKindStatus`, and `AppKindProfile` to a shared
      types module under `apps/platform/src/lib/types/` (new file:
      `app-kind.ts`). Re-export from any existing barrel.

### Storage

- [ ] D1 migration: `kind_profile_json` on `deploys` (the existing
      per-version table — see
      `apps/platform/src/lib/server/db/schema/deploys.ts`),
      `current_detected_kind` and `current_public_kind_status` on `apps`.
      Land alongside the existing `proof_events` and `capability_badges`
      tables (see commit `368e222`).
- [ ] KV write helper alongside `writeAppProfile` in
      `apps/platform/src/lib/server/deploy/kv-write.ts`:
      `writeAppKindProfile(kv, slug, profile)` storing at
      `apps:{slug}:kind-profile`.
- [ ] Read helper in
      `apps/platform/src/lib/server/marketplace/capability-badges.ts` (or a
      sibling file) that pulls the kind profile next to the existing
      profile blob.

### Marketplace UI

- [ ] Add a `KindBadge.svelte` component beside the existing
      `apps/platform/src/lib/components/marketplace/CapabilityBadges.svelte`.
      Renders `publicKind` + `publicKindStatus` with the copy from the
      copy bank.
- [ ] Wire `KindBadge` into:
      - `AppCard.svelte` (compact: just the kind word with a colour dot)
      - `AppGrid.svelte` (filterable badge row)
      - `apps/platform/src/routes/apps/[slug]/+page.svelte` (full
        explanation: reasons, external domains, providers)
- [ ] Add a "Kind" filter to `SearchBar.svelte` / category shelves
      (`CategoryShelf.svelte`) — `local | connected | cloud | any`.

### Maker dashboard

- [ ] On `apps/platform/src/routes/dashboard/apps/[slug]/+page.svelte`,
      surface the maker's `declaredKind` vs the platform's `detectedKind`,
      with the conflict copy if they diverge and a "Dispute detection"
      action.
- [ ] On the enhancements page
      (`apps/platform/src/routes/dashboard/apps/[slug]/enhancements/+page.server.ts`),
      surface `localization.candidate` and the supportedTransforms list
      with a "Localize this app" CTA pointing at the (yet-to-build)
      Phase 2 flow. For now the CTA is a wait-list signup.

**Exit criteria**: every app in the marketplace renders a kind badge.
Maker dashboard shows declared vs detected. The Phase 1 detector can write
a profile and have it round-trip through D1, KV, and the UI.

## Phase 1 — Honest classification at deploy (launch blocker)

Plug a kind detector into the existing `@shippie/analyse` pipeline so every
deploy produces an `AppKindProfile`.

### Static analysis

- [ ] New module `packages/analyse/src/kind-classifier.ts` consuming the
      existing scanner outputs (`js-scanner.ts`, `html-scanner.ts`,
      `css-scanner.ts`, `wasm-detector.ts`, `semantic-classifier.ts`).
- [ ] Provider detection rules (live in
      `packages/analyse/src/kind-classifier.ts`):
      - Cloud markers: imports of `@supabase/supabase-js`,
        `firebase/{firestore,auth,storage}`, `next-auth`, `@auth/*`,
        `@vercel/postgres`, RSC server-action emissions, SvelteKit server
        endpoints, Next.js API routes, server-side Supabase clients
        (`createServerClient` from `@supabase/ssr`).
      - Local markers: service-worker registration, IndexedDB usage, OPFS
        access, SQLite WASM imports (`@vlcn.io/wa-sqlite-wasm`,
        `@sqlite.org/sqlite-wasm`), Dexie, PouchDB, Shippie SDK imports.
      - Connected markers: `fetch()` calls to non-Shippie hosts that
        aren't backend providers — feature data sources.
- [ ] Decision rule:
      - Any Cloud marker → `detectedKind = 'cloud'`.
      - Else any non-Shippie outbound fetch → `detectedKind = 'connected'`.
      - Else `detectedKind = 'local'`.
      - `confidence` derived from coverage (did we actually scan all the
        bundles? did we hit minified vs source?).

### Pipeline integration

- [ ] In `apps/platform/src/lib/server/deploy/pipeline.ts`, after the
      existing `writeAppProfile` call, run the kind classifier and call
      the new `writeAppKindProfile`. Update the denormalized fields on
      the `apps` row in the same transaction.
- [ ] Auto-generate the honest blurb from the profile (used in the
      marketplace listing). Logic lives next to the badge generator.
- [ ] Deploy-time review screen (Phase 0b dashboard work) shows the
      blurb to the maker and lets them confirm or dispute before the
      listing goes public.

### Proof wiring

- [ ] Extend the proof event taxonomy in
      `apps/platform/src/lib/server/proof/taxonomy.ts` (referenced from
      `capability-badges.ts`) to include kind-confirming events:
      `kind-local-launch-offline`, `kind-local-write-local`,
      `kind-connected-graceful-degrade`,
      `kind-leak-personal-data` (demotion trigger).
- [ ] Wrapper emits these events. The platform consumes them and updates
      `publicKindStatus` from `estimated` → `verifying` → `confirmed` (or
      demotes on a leak).
- [ ] v1 of "core workflow completed offline": maker-declared probes on
      the deploy form (a list of route paths or button selectors). The
      wrapper observes whether those probes resolve while offline. SDK
      instrumentation and wrapper-observed patterns are deferred.

### Tests

- [ ] `packages/analyse/src/kind-classifier.test.ts` — sample apps in
      each kind, conflict cases, confidence calculation.
- [ ] `apps/platform/src/lib/server/marketplace/kind-rendering.test.ts`
      (vitest) — public label derivation across all status combinations.
- [ ] Smoke test: each of the four showcase apps classifies according to
      its actual dependencies. Expected labels (verified against HEAD on
      2026-04-26):
      - `apps/showcase-recipe` → **Connected** (imports
        `apps/showcase-recipe/src/api/open-food-facts.ts` which fetches
        `world.openfoodfacts.org` as feature data).
      - `apps/showcase-journal` → **Local** (no outbound fetches in
        source; data stays local via `src/db/`).
      - `apps/showcase-whiteboard` → **Connected** (real-time peer sync
        via the Shippie SignalRoom DO; without signalling, multi-peer
        flow doesn't work).
      - `apps/showcase-live-room` → **Connected** (guest/host quiz
        flow via SignalRoom DO).
      Smoke test asserts each app's classifier output matches this list.
      Run as part of `bun run health`.

**Exit criteria**: every successful deploy emits a kind profile. The
marketplace shows the expected label for each showcase app per the table
above, plus a sample Cloud app (something Supabase-backed, scaffolded
fresh). `bun run health` stays green.

## Phase 2 — Localize (opt-in source migration)

Out of scope for this rollout but the v1 supportedTransforms list is the
contract Phase 1's `localization.supportedTransforms` field will populate:

- `supabase-basic-queries` → `shippie.local.db` (select/insert/update/delete,
  simple filters, order, limit).
- `authjs-to-local-identity` → durable per-install identity, no login
  page, synthetic always-authenticated session.
- `firebase-firestore-basic` → `shippie.local.db`.
- `supabase-storage-to-local-files` → `shippie.local.files`.

Hard-refused (always go in `blockers`): RLS, RPC, realtime, edge
functions, server-side Supabase admin clients, complex relational
selects, `pg_*` extensions.

Output is a reviewable diff applied to the maker's source repo, never a
hidden runtime shim.

## Phase 3 — Remix (regenerate from intent)

For apps where blockers preclude Localize. Reads UI / routes / schema,
regenerates as a Shippie SDK app. Both versions can coexist; maker picks.

## Phase 4 — Upstream the default (Shippie MCP)

MCP server that, when connected to Claude Code, makes Shippie SDK + local
SQLite the default scaffold instead of Supabase + cloud. New apps born
Local instead of transformed after the fact.

## Sequencing

Phase 0a + 0b + 1 are the launch surface. They make the marketplace honest
*today* without requiring Localize or Remix to exist yet. Phases 2–4 are
the magic, but shipping them before Phase 1 is solid would mean making
promises Shippie can't keep at scale.

The detector and the proof loop in Phase 1 are the trust foundation. Build
it once, build it well, and Localize / Remix become differentiated upgrades
on top of an already-honest platform — not last-ditch attempts to deliver
on an over-promise.

## Open questions

- Do we want a fourth status `revoked` for apps where a leak demoted Local
  and the maker disputed it? Or does `disputed` cover it?
- Where does the maker-facing "Kind" choice live in the deploy form — at
  upload, after analysis, or both?
- Should the wrapper hard-block undeclared personal-data domains for
  apps declared Local, or only flag them? (Hard-block is more honest;
  flag is more compatible with mistakes.)

These are surfaced for review before Phase 0b implementation begins.
