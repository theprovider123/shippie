# App Kinds — Local, Connected, Cloud

Shippie classifies every app it accepts into one of three kinds. The kind is
the user-facing answer to "does this work offline, and where does my data
live?" It feeds the marketplace label, listing copy, search filters, and
proof badges.

This document is the load-bearing definition of the vocabulary. Code (the
deploy pipeline, the analyser, the marketplace components) refers back here.
If a definition feels ambiguous in a specific case, fix the doc — don't fork
the meaning in code.

## The three kinds

### Local

Your app data lives on your device. Core features work offline.

The app may exchange traffic with Shippie itself (wrapper assets, proof
telemetry, update checks) and may load static assets from a CDN, but it does
not depend on external data services to function. There is no meaningful
external-data dependency.

Examples: a notes app, a habit tracker, a journal, a calculator, a
local-AI assistant, an offline whiteboard.

### Connected

Your app data lives on your device. The app connects for live information,
sync, backup, payments, maps, search, AI inference, or other online
features.

Personal/user data is local. External data is fetched on demand and ideally
cached so the core flow keeps working offline. The distinguishing test:
**core works offline, fresh data needs internet.**

Examples: a recipe app that uses an external recipe API, a weather widget,
a local-first inbox that syncs over CRDTs, a journal that backs up to
Drive, a shopping list that fetches store prices.

### Cloud

Your app data — or core app state — lives on someone else's server. The app
usually needs internet, an account, or a hosted backend to function.

The "or core app state" clause matters. An app may not store much personal
data and still be Cloud if it can't function without remote services
(server-rendered pages, hosted multiplayer rooms, payment-flow servers,
remote AI agents holding session state).

Examples: a Supabase-backed CRUD app, a multiplayer game with global
leaderboards, an e-commerce store, a SaaS dashboard fronting a hosted API.

## Public labelling

Static analysis is an estimate, not an oracle. The marketplace label is
Shippie's *detected* kind, qualified by a confidence status:

| Status | Meaning | Surfaced as |
|---|---|---|
| `estimated` | Static analysis only. No proof yet. | "{Kind} — verifying" |
| `verifying` | Some proof events received, threshold not met. | "{Kind} — verifying" |
| `confirmed` | Proof threshold met across recent sessions. | "{Kind}" with checkmark |
| `disputed` | Maker contests the detected kind. | "{Kind} — under review" |

Examples: a Local app with status `estimated` renders as "Local — verifying"; a Cloud app with status `disputed` renders as "Cloud — under review". The kind word doesn't change with status — only the qualifier.

The maker's declared kind is *never* shown directly on the public listing.
It surfaces in the dashboard, in the deploy-time review screen, and in the
"claim verification" flow if a maker disputes detection. Public truth is
detection plus proof, not maker word.

## Local proof — the rules

A `local` detection is upgraded from `estimated` → `confirmed` when, across
a meaningful sample of recent sessions, *all* of the following hold:

1. The app launched successfully while offline.
2. A core workflow completed offline.
3. All user-data writes hit local browser/device storage or the Shippie
   local runtime. Acceptable backends include IndexedDB, OPFS, SQLite WASM,
   localStorage, Dexie, PouchDB, the Shippie local DB, and the Shippie
   local files API. (A stronger sub-badge is awarded when the writes hit
   Shippie-managed storage — it's the only backend where Shippie can
   guarantee transfer, backup, and the Your Data panel.)
4. No undeclared personal-data domains were contacted during the session.

Allowed traffic during a confirmed-Local session:

- Shippie wrapper / proof / update endpoints.
- Static asset CDNs (images, fonts) declared at deploy time.
- Nothing else.

If an app ships personal data to an undeclared host, Local is demoted —
even if the maker declared Local and the static analysis agreed.

### Defining "core workflow completed"

"Core workflow" is too vague to leave undefined. The rollout plan picks
*one* of these as the v1 definition (see the Phase 1 plan):

- **Maker-declared workflow probes**: at deploy time, the maker marks one
  or more user actions as the "core flow." The wrapper observes whether
  these complete offline.
- **SDK instrumentation**: apps using the Shippie SDK emit
  `core-workflow-complete` proof events at natural completion points.
- **Wrapper-observed patterns**: the wrapper infers a completed workflow
  from a create-then-read or write-then-render sequence happening within
  one offline session.

The v1 implementation can start with maker-declared probes (lowest
ambiguity) and grow into SDK / wrapper-observed proofs over time.

## Connected proof

A `connected` detection is `confirmed` when:

1. Core workflow completes offline (same definition as Local).
2. External data fetches resolve when online and degrade gracefully (cached
   or empty-state) when offline.
3. Personal data writes hit local storage, not the external host.

A Connected app that fails to degrade gracefully gets a "fresh-data
required" qualifier — still Connected, but the listing says
"requires internet for some features."

## Cloud proof

Cloud apps don't need offline proof. The badge set focuses on honesty:
which providers, what data they hold, what region, whether they advertise
end-to-end encryption, etc. This is the surface where Shippie can still
add value (proof of provider, data location, retention) without pretending
the app is local.

## Profile shape

The deploy pipeline produces an `AppKindProfile` per deploy. It lives next
to the existing `@shippie/analyse` `AppProfile` in KV (see
`apps/platform/src/lib/server/marketplace/capability-badges.ts` for how the
existing profile is read).

```ts
type AppKind = 'local' | 'connected' | 'cloud';
type PublicKindStatus = 'estimated' | 'verifying' | 'confirmed' | 'disputed';

interface AppKindProfile {
  // Maker's declaration on the deploy form. Optional. Never shown to users.
  declaredKind?: AppKind;

  // Static analysis output. The starting point for the public label.
  detectedKind: AppKind;

  // The label the marketplace actually renders, plus its confidence state.
  // Derived from detectedKind + proof events. Denormalized here so the UI
  // doesn't re-derive nuance everywhere.
  publicKind: AppKind;
  publicKindStatus: PublicKindStatus;

  // 0..1 confidence the static analysis attaches to detectedKind. Drives
  // whether the UI surfaces "verifying" copy.
  confidence: number;

  // Human-readable lines explaining the detection: "imports
  // @supabase/supabase-js", "service-worker present", "fetches
  // api.openweathermap.org as feature data".
  reasons: string[];

  // Outbound hosts found in source. The maker can mark hosts as
  // "Shippie / proof / update", "feature data", or "personal data".
  externalDomains: string[];

  // Detected backend providers: 'supabase' | 'firebase' | 'authjs' |
  // 'next-auth' | 'vercel-functions' | 'sveltekit-endpoints' | ...
  backendProviders: string[];

  // Detected local signals: 'service-worker' | 'indexeddb' | 'opfs' |
  // 'sqlite-wasm' | 'localstorage' | 'shippie-sdk' | 'dexie' | 'pouchdb'.
  localSignals: string[];

  // Whether Shippie thinks it can offer a Localize migration, with the
  // blockers it found and the supported transforms it would apply.
  // Modelled separately from kind because eligibility for migration is
  // not the same thing as what the app currently is.
  localization: {
    candidate: boolean;
    blockers: string[];
    supportedTransforms: string[];
  };
}
```

## Persistence

The profile is the durable record of "what was this app at this version."
It lives **per deploy** so kind history is preserved across versions of
the same app.

The app row keeps a denormalized `currentDetectedKind` and
`currentPublicKindStatus` for fast marketplace queries (filter by kind,
sort by status). On a new successful deploy, the denormalized fields are
updated to match the latest profile.

D1 schema sketch (resolved during Phase 0b). The per-version table is
`deploys` (see `apps/platform/src/lib/server/db/schema/deploys.ts`); there
is no `app_versions` table.

```sql
ALTER TABLE deploys ADD COLUMN kind_profile_json TEXT;
ALTER TABLE apps ADD COLUMN current_detected_kind TEXT;
ALTER TABLE apps ADD COLUMN current_public_kind_status TEXT;
```

The full profile JSON also remains in KV at `apps:{slug}:kind-profile`
alongside the existing `apps:{slug}:profile` blob, so the deploy pipeline
and the wrapper can read it without a D1 round trip.

## Conflict handling

| declaredKind | detectedKind | publicKind | publicKindStatus | Action |
|---|---|---|---|---|
| local | local | local | estimated → confirmed via proof | Standard |
| local | connected | connected | estimated | Notify maker. Show reasons. Offer Localize if `localization.candidate`. |
| local | cloud | cloud | estimated | Notify maker. Show blockers. Offer Remix if eligible. |
| connected | local | local | estimated | Maker over-declared. Use detection. |
| cloud | cloud | cloud | estimated | Maker is honest. Standard. |
| (none) | * | detectedKind | estimated | Default flow for non-declaring uploads. |
| any | any | (was confirmed) | disputed | Maker filed a dispute; flag for review. |

Public truth is `publicKind` + `publicKindStatus`. Maker declaration is
input, not output.

## Demotion

Proof events can demote a confirmed Local to Connected or Cloud if reality
diverges from detection (e.g. personal data observed leaving the device).
Demotion is a one-way operation per session; reversal requires a new
deploy with new analysis.

## Why this vocabulary

Three labels, each tied to a single concrete user-visible question:

- **Local** — does it work without internet?
- **Connected** — does my data stay on my device?
- **Cloud** — am I trusting someone else's server?

Adding more tiers (gold/silver/bronze, mostly-local, hybrid, etc.) dilutes
this. Capability badges and proof states do the fine-grained work; the
kind stays a clean ladder of three.
