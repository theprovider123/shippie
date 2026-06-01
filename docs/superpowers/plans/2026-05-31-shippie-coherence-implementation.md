# Shippie Coherence Implementation

## Public Language

Keep "Shippie OS" as internal shorthand. Public copy should stay concrete:

- Wrap: package an app with Shippie's runtime, trust, offline, and data defaults.
- Run: launch local-first tools that work across desktop, mobile, PWA, and offline paths.
- Connect: let apps share user-granted intent data without introducing a backend tax.

The ideology is not "fewer apps." It is a tighter slate where every app has a clear role, every retired path has an honest successor, and every maker deploy lands in the same runtime contract.

## App Role Contract

Every app declares three independent axes in `shippie.json`.

- `visibility`: who can see/open it from product surfaces: `public`, `unlisted`, `private`, `team`, `local`.
- `curation.surface`: where it can appear editorially: `featured`, `arcade`, `labs`, `archived`.
- `curation.tier`: why it exists: `public-flagship`, `private-flagship`, `supported`, `arcade`, `labs`, `legacy`, `production`.

There is no `private` surface. Private apps keep a normal surface, usually `labs`, and rely on `visibility: "private"` to stay out of public catalogues.

## Current Roster

Public flagships: Palate, Chiwit, Mise, Symptom Diary, Lift, Golazo, Tab, Receipt Snap, Voice Memo, Journal, Read Later, Match Room.

Private flagships: Mevrouw, Cycle, Therapy Notes, Care Log, Co-Pilot, Hearth. These stay in the repo and generated registry, but are hidden from public curated surfaces.

Supported first-party: Coffee, Dough, Steep, Sleep, Quiet, Crewtrip, Ledger.

Arcade: working standalone games stay public arcade entries instead of being collapsed into Daily Puzzle.

Labs: exploratory apps that are still useful but not launch-slate promises.

Legacy: retired apps are still baked for direct/saved links and point to a successor where one exists.

## Maker Deploy Flow

1. Maker runs `bun run new:showcase <slug>` for first-party showcases or deploys a static app through the maker upload/API path.
2. The app manifest declares visibility, curation, data passport, permissions, and intents. Missing role metadata fails first-party validation.
3. The deploy pipeline resolves surface and visibility once, then writes D1, KV metadata, package metadata, PWA readiness, trust report, and deploy report from the same values.
4. The generated first-party registry drives launcher/public shelves, catalogue state, arcade shelves, and analytics seeds.
5. Public surfaces only render `visibility: "public"` entries. Private flagships can keep improving without quietly becoming marketing promises.

## Verification Matrix

Required automated checks:

- Manifest contract: all showcases declare legal visibility, surface, tier, category, same-origin icons, and known canonical/legacy intents.
- Generated registry: `prepare-showcases --generated-only` regenerates curation, shelves, public flagship order, and hosted slugs.
- Migration discipline: new migrations cannot introduce duplicate numeric prefixes; existing duplicate prefixes are documented exceptions only.
- Deploy contract: manifest visibility and curation propagate into app rows, KV metadata, and portable package metadata.
- Launcher/public catalogue: private flagships do not appear in featured, arcade, or labs public fallbacks.
- Legacy routing: archived successors redirect at `/run/<old>` and subdomain entry points; live arcade/private/public flagship slugs stay canonical.
- Offline/PWA: `prove:offline-root`, `prove:offline-conformance`, WebKit offline, origin-killed offline, and saved-app capsule tests.
- Runtime modes: desktop browser, mobile viewport, installed PWA, offline PWA, direct `/run`, subdomain, and embedded container iframe.
- Data edges: local DB unavailable, storage wiped, sealed-copy handover, private spaces pairing, and cross-device recovery.
- Trust edges: telemetry must only mirror through Trust Ledger; blocked ledger persistence must block egress instead of sending anyway.

## Edge Cases To Keep Testing

- Private app with `surface: "featured"` should fail validation.
- `curation.surface: "private"` should never be accepted.
- Missing `curation.tier` should fail first-party generation.
- Unknown intent strings should fail manifest contract until added as a canonical intent or explicit legacy alias.
- Maker manifests without `curation.tier` remain deployable and default package role to `production`.
- `visibility: "local"` in a deploy manifest normalizes to private runtime access when persisted to the deployed-app visibility scope.
- Existing archived slugs remain routable even when hidden from all public shelves.
