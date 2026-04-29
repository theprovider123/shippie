# Container Commons Implementation Plan

**Date:** 2026-04-27  
**Status:** Draft implementation overlay  
**Depends on:** `2026-04-27-master-improvement-plan.md`, ADR 006, Container Commons package/runtime spec

## North star

> **One Shippie. Every app. Your data stays here.**

Builder-facing:

> **Container-first experience. URL-first ownership. Package-first portability.**

This plan does not replace the master improvement plan. It sits on top of it. Claude's current work should continue on Day-0 fixes, real SDK, minimal MCP, Deploy Truth, proof, trust reports, and update safety. This plan starts by defining the portable app commons and then consumes those foundation pieces as they land.

## What not to duplicate

Do not rebuild these here:

- real `/__shippie/sdk.js` bundle
- proof/kind auto-boot
- Deploy Truth scanner
- security/privacy reports
- update safety engine
- private analytics/feedback runtime
- Localize source migrations

Instead, this plan consumes their outputs:

- real SDK becomes the standalone/container SDK surface
- deploy report becomes package metadata
- trust report becomes container eligibility input
- update safety becomes app receipt + migration preview input
- analytics/feedback become container capabilities
- Localize becomes one path to produce better packages

## Phase C0 - ADR + package contract

**Status:** initial slice shipped.

Deliverables:

- ADR 006: container commons runtime
- `.shippie` package spec
- `@shippie/app-package-contract` with TypeScript types and validation for manifests, permissions, trust reports, receipts, and remix/container gates
- `@shippie/app-package-builder` skeleton that emits deterministic package artifacts from app files and package metadata
- filesystem packaging helper with a real showcase-project smoke test that excludes `dist`, `.turbo`, `node_modules`, and tsbuildinfo noise
- bridge request/response types plus permission enforcement helpers for the future iframe capability bridge
- `@shippie/container-bridge` with host/client RPC, in-memory transport tests, and runtime capability enforcement
- window-style `postMessage` transport adapter for iframe/container mode
- runtime modes: standalone, container, Hub
- permission/capability model
- version layers: code, trust, data
- app receipts
- user data archive format
- container eligibility states

Definition of done:

- The spec answers: what is portable, what is trusted, who owns identity, and how apps run without becoming container-only.

## Phase C1 - Data model skeleton

Add durable schema objects without building the full UI yet.

Status: initial platform skeleton landed. `app_packages` records package artifacts per
deploy/version, `app_lineage` holds source/remix ownership at app scope, and user
install receipts remain local-only container data.

New or extended concepts:

```ts
type ReleaseChannel = 'stable' | 'beta' | 'experimental' | 'venue' | 'classroom';

type ContainerEligibility =
  | 'first_party'
  | 'curated'
  | 'compatible'
  | 'standalone_only'
  | 'blocked';

interface AppPackageRecord {
  id: string;
  appId: string;
  deployId: string;
  version: string;
  channel: ReleaseChannel;
  packageHash: string;
  packagePath: string;
  manifestPath: string;
  trustReportPath?: string;
  deployReportPath?: string;
  createdAt: string;
}

interface AppLineageRecord {
  appId: string;
  templateId?: string;
  parentAppId?: string;
  parentVersion?: string;
  sourceRepo?: string;
  license?: string;
  remixAllowed: boolean;
}

interface AppReceiptRecord {
  appId: string;
  packageHash: string;
  installedAt: string;
  source: 'marketplace' | 'url' | 'hub' | 'package' | 'nearby';
  grantedPermissionsHash: string;
}
```

Implementation notes:

- Keep package records per deploy/version, not only per app.
- Store package manifests as artifacts first; denormalize only query fields.
- Do not put user receipts in D1. User receipts are local-container data.

Definition of done:

- Platform can record that a deploy produced a package artifact without needing the container UI.

## Phase C2 - `.shippie` package builder

Add the package build step after Deploy Truth artifacts exist. The initial pure builder already exists in `packages/app-package-builder`; the remaining work is to feed it real deploy artifacts and persist the outputs.

Status: portable archive envelope landed. `@shippie/app-package-builder` now
creates and verifies a deterministic `shippie.archive.v1` JSON envelope with
base64 file bytes and per-file hashes. Deploy writes the verified archive beside
package metadata in R2, and the container can paste-import either a manifest or
a full archive.

Inputs:

- normalized build output
- `shippie.json` / compiled internal manifest
- deploy report
- trust report
- permissions report
- source/license metadata
- changelog metadata
- migration plan, if present

Outputs:

- `manifest.json`
- `version.json`
- `permissions.json`
- `source.json`
- `license.json`
- `changelog.json`
- `deploy-report.json`
- `trust-report.json`
- `migrations.json`
- app files
- package hash

Storage:

```text
packages/{slug}/{version}/{packageHash}.shippie
packages/{slug}/{version}/manifest.json
packages/{slug}/channels/stable.json
```

Definition of done:

- A showcase app deploy produces a deterministic `.shippie` package.
- The package can be unpacked and its manifest verified locally.
- Package generation does not block the under-60s deploy path if large assets are involved; it can complete as part of the deploy report finalization.

## Phase C3 - Runtime contract tests

Before building the container UI, lock the contract.

Tests:

- standalone smoke: package app opens at its URL
- container smoke fixture: package app boots in a sandboxed frame
- bridge handshake fixture
- permission denied fixture
- allowed network domain fixture
- namespace enforcement fixture
- offline cached package fixture

Definition of done:

- A toy app can pass both standalone and container-mode tests using the same SDK surface.

## Phase C4 - Container shell MVP

Build the installed Shippie container as a calm PWA with four tabs.

Status: initial shell landed at `/container` with Home, Discover, Create,
and Your Data surfaces. V1 uses curated/showcase fixtures until the package
resolver reads live `app_packages` rows.

Screens:

- Home: installed apps, recent apps, updates
- Discover: curated first-party/showcase apps only
- Create: placeholder actions for Remix/Fork/Deploy/MCP
- Your Data: receipts, storage placeholder, export placeholder

Rules:

- Only first-party/showcase apps load in v1.
- Standalone URLs remain the canonical fallback.
- No social feed.
- No arbitrary third-party app loading.

Definition of done:

- Installing `shippie.app` gives a user a home for Shippie apps.
- First-party packages appear in Home/Discover and can be opened.

## Phase C5 - Sandboxed app viewport

Implement the iframe runtime.

Status: initial multi-app iframe runtime landed. Open app frames stay mounted
while the user returns Home or opens another curated app.

Components:

- app package resolver
- package asset cache
- iframe viewport
- app stack
- pause/resume lifecycle
- error boundary
- back/home gesture
- recent apps registry

Security baseline:

- sandboxed iframe by default
- no raw shared storage
- bridge-only capabilities
- no dynamic same-document third-party apps

Definition of done:

- Open Recipe Saver, go Home, open Journal, return to Recipe Saver without a reload.
- A failing app shows a friendly recovery panel and does not crash the container.

## Phase C6 - Capability bridge v1

Implement request/response RPC over `postMessage`.

Status: bridge host/client landed with permission enforcement, window transport,
payload limits, rate limits, sibling-app isolation, and visible denied-capability
responses in the container shell.

Initial capabilities:

- `app.info`
- `storage.getUsage`
- `db.query`
- `db.insert`
- `files.write`
- `files.url`
- `feedback.open`
- `analytics.track`

Enforcement:

- package identity
- container eligibility
- permission grants
- namespace mapping
- payload size limits
- rate limits

Definition of done:

- A container app can write/read local namespaced data through the bridge.
- A denied permission returns a typed error and is visible in dev tooling.

## Phase C7 - Maker ownership surfaces

Build ownership surfaces before broad container distribution.

Status: first ownership surfaces landed. `shippie.json` accepts optional
source/license/remix lineage metadata, deploys persist app-level lineage, the
package source metadata reflects those fields, and app detail pages now show
maker identity, verified custom domains, standalone URL, Open in Shippie,
source, license/remix status, and recent package versions.

Surfaces:

- maker profile
- source repo link
- license/remix status
- custom domains
- version timeline
- human changelog
- release channel selector
- "Open in Shippie" button on app pages and custom domains

Definition of done:

- A maker can point to a custom domain and still feel the app is theirs.
- A user can tell who made an app and whether it can be forked/remixed.

## Phase C8 - Receipts + Your Data v1

Build the local ownership layer.

Status: first local receipt skeleton landed in the container shell. Installed
curated apps get stamped receipts, namespace row counts, clear-data actions,
and a receipt export preview. Browser-local persistence plus a Web Crypto
encrypted backup export/restore skeleton now exist; `.shippie` package import
for unknown restored receipts remains next.

Features:

- local app receipts
- installed app list
- permissions per app
- storage by app
- delete app data
- export app receipt
- encrypted backup skeleton

Definition of done:

- User can answer: what apps do I have, what can they do, where is their data, and how do I remove/export it?

## Phase C9 - Update cards + version trust

Consume update safety outputs.

Status: first container update-card skeleton landed. Installed app receipts are
compared against the currently available package metadata; package hash,
permission, and kind changes have a visible Stay/Update surface. This is a
consumer shell only and does not duplicate the update-safety engine.

Features:

- human update card
- permission diff
- trust diff
- data migration preview
- stay on current version
- rollback pointer for app package

Definition of done:

- App update that adds a domain asks clearly before changing trust posture.
- App update that only adds bundle content says user data is unchanged.

## Phase C10 - Fork/remix lineage

Only after package, source, license, and ownership are real.

Status: first consumer-facing lineage actions landed. App pages now expose Use
in Shippie, View Source, Remix this app when source/license gates allow it, or a
clear unavailable state when the maker has not opened the source/remix terms.

Features:

- fork from app
- remix from template
- lineage graph
- attribution
- source/license gates
- "Use / Remix / View Source / Versions" actions

Definition of done:

- A template app can be remixed into a new app with lineage and attribution preserved.

## Phase C11 - Collections and Hub install path

Status: portable package import is now archive-aware. Users can paste a full
verified `shippie.archive.v1` envelope into the container, cache its app files
locally, open the real packaged entrypoint, and write through the sandboxed
bridge. The shared contract now includes `shippie.collection.v1`, and the
platform exposes `/api/collections/official` as a mirrorable collection manifest
for Hubs and local marketplace subsets. `@shippie/core` now has shared package
install/mirror helpers, and `shippie install <package> --target <dir|hub.local>`
can verify a `.shippie` archive, produce a local receipt, and write a local Hub
mirror with `packages/` plus `collections/local-mirror.json`.
`services/hub` now exposes the matching narrow Hub side: `POST /api/packages`
accepts the archive, verifies it, unpacks app files into the existing static
cache, serves the archive from `/packages/<hash>.shippie`, and updates
`/collections/local-mirror.json`.

Features:

- official collections
- maker collections
- community collections
- Hub/local collections
- package mirror manifest
- `shippie install app.shippie --target hub.local`

Definition of done:

- A Hub can ingest a `.shippie` package and expose it in a local marketplace subset.
- A local mirror directory can be generated from the same CLI/core path without
  calling shippie.app.

## Phase C12 - Later, not now

Do not build yet:

- gossip relay
- automatic broad third-party container admission
- same-document rendering for third-party apps
- public federation
- social graph
- algorithmic feeds

## Implementation guardrails

1. **Container is preferred, not mandatory.** Standalone URLs and custom domains remain first-class.
2. **Apps do not get raw shared storage.** All privileged access goes through the capability bridge.
3. **Packages are the truth.** If it cannot be represented in a `.shippie` package, it is not portable enough.
4. **Maker identity is visible.** Container distribution must not erase maker ownership.
5. **Licenses gate remixing.** No source/license metadata, no Remix button.
6. **Keep v1 calm.** Four tabs, curated apps, no feed.
7. **Hub is a target from day one.** The same package and core APIs must work against `hub.local`.

## Suggested first tickets

1. [x] Add ADR 006 and the package/runtime spec.
2. [x] Add `packages/app-package-contract` with TypeScript types for manifests, permissions, receipts, and eligibility.
3. [x] Add package manifest validation tests.
4. [x] Add package builder skeleton that emits deterministic package artifacts from app files + metadata.
5. [x] Add filesystem package helper and showcase project smoke test.
6. [x] Feed real Deploy Truth artifacts into `@shippie/app-package-builder` for one deployed app path.
7. [x] Add bridge request/response contract and capability permission checks.
8. [x] Add container bridge host/client package with in-memory handshake test.
9. [x] Add `postMessage` transport adapter for iframe/container mode.
10. [x] Add container-mode fixture app using a real iframe harness.
11. [x] Add Shippie container shell lab route.
12. [x] Add iframe viewport for curated showcase apps.
13. [x] Add bridge payload limits, rate limits, and sibling-app isolation.
14. [x] Add local receipt/export skeleton to Your Data.

The first code ticket should be the contract package, not the UI. That keeps the idea portable before it becomes beautiful.
