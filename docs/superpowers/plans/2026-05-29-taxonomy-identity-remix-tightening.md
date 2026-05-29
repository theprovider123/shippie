# Taxonomy, Identity, Remix Tightening - 2026-05-29

**Status**: Plan ready for implementation  
**Owner**: Devante  
**Scope**: Marketplace categorisation, slug safety, app identity leaks, remix compatibility, logo ingestion, and discovery rules.

## Bottom Line

Do not rebuild identity or remix. HEAD already has UUID app rows, unique slugs, reserved-slug enforcement hooks, app lineage, remix eligibility, `/new?remix=`, CLI/MCP handoff, and remix-spec extraction.

The work is smaller and sharper:

1. Seed and complete reserved slugs now.
2. Make category control real at the write boundary.
3. Stop mutable slug from leaking into storage, packages, offline capsules, and default data families.
4. Wire existing Data Passport compatibility into remix flows.
5. Replace external logo URLs with same-origin ingested assets.
6. Keep discovery to Category + Kind + Surface, with tags/search/collections layered on top.

## Ground Truth From HEAD

- DB identity exists: `apps.id` is a UUID primary key and `apps.slug` is separate and unique.
- Slug validation exists in deploy preflight and profile rename.
- Reserved slug table and seed constant exist, but the seed is not inserted by any migration or startup path found in HEAD.
- Remix lineage exists in `app_lineage`.
- Remix flow exists through app detail, `/new?remix=`, CLI, MCP, and `/api/apps/[slug]/remix`.
- Remix spec extraction exists in `packages/analyse/src/remix-spec.ts`.
- Data Passport exists in app package metadata, with `assessDataPassportCompatibility()` already implemented.
- Category control exists in curation schema, but writes still bypass it.
- Logo/icon support exists only as `apps.icon_url` / external `iconUrl`.

## Current Bugs

### 1. Reserved Slugs Are Not Actually Seeded

`RESERVED_SLUGS_SEED` exists in:

- `apps/platform/src/lib/server/db/schema/reserved-slugs.ts`

But enforcement reads from D1:

- `apps/platform/src/lib/server/deploy/reserved-slugs.ts`

No migration inserts the seed. The only insert path found is admin suspension. That means route and brand reservations may be empty in production.

Also missing from the seed:

- `run`
- `you`
- `c`
- `glance`
- `today`
- `arcade`
- `labs`
- `auth`
- `invite`

`new`, `apps`, `api`, `dashboard`, `docs`, and core brand/system slugs are already in the seed constant.

### 2. Category Control Exists But Does Not Control Writes

Controlled list currently lives in:

- `apps/platform/src/lib/curation/schema.ts`

Uncontrolled or inconsistent writes/read bridges exist in:

- `apps/platform/src/lib/server/deploy/pipeline.ts`
- `apps/platform/src/lib/server/deploy/wrap.ts`
- `apps/platform/src/lib/server/deploy/manifest.ts`
- `apps/platform/src/routes/api/deploy/github/+server.ts`
- `apps/platform/src/routes/dashboard/apps/[slug]/profile/+page.server.ts`
- `apps/platform/src/routes/apps/[slug]/+page.server.ts`
- `apps/platform/src/routes/+page.server.ts`
- `apps/platform/src/routes/you/+page.server.ts`

Observed freeform container categories:

- `cooking`
- `creativity`
- `family`
- `fitness`
- `games`
- `health`
- `home`
- `journal`
- `memory`
- `money`
- `productivity`
- `social`
- `tools`
- `travel`
- `wellness`

The local `marketplaceCategory()` bridge emits `productivity` and `lifestyle`, but those are not in `VALID_CATEGORIES`.

### 3. Mutable Slug Leaks Into Identity-Like Storage

Known leak sites:

- KV runtime keys: `apps:{slug}:*`
- R2 deploy artifacts: `apps/{slug}/...`
- Offline capsule cache names and IndexedDB pointers: `capsule:{slug}:{hash}`
- Package manifest identity: `id: app_${input.slug}`
- Default data passport family: `defaultDataPassport(slug)`

The DB model is sound. The storage/runtime defaults are the risk.

### 4. Third-Party Renames Do Not Get General Redirects

First-party aliases are hardcoded in:

- `apps/platform/src/lib/showcase-slugs.ts`

Maker app renames migrate KV/R2 and then redirect the profile save to the new slug, but there is no generic `slug_aliases` table. Old third-party links, bookmarks, and installed PWA entry points can 404 after rename.

### 5. Remix Compatibility Is Present In Pieces, Not A Flow

Data Passport exists in packages. Remix eligibility and lineage do not consume it.

The missing product behavior:

- show whether a remix can read/replace the parent app's data
- warn if data family changes
- require an explicit migration/import path when schema changes
- make remix depth an explicit choice instead of an implicit default

### 6. Logo URLs Are A Privacy And Reliability Hole

Dashboard profile accepts external icon URLs and `cleanUrl()` accepts `http:`. External icons can become:

- mixed content
- tracking beacons
- broken drawer visuals
- trademark/impersonation vectors

Logos should be ingested, stored, sanitized, resized, and served same-origin.

## Target Classification Model

Use only three controlled app axes:

1. **Category** - broad content/workflow door.
2. **Kind** - Local / Connected / Cloud. Already exists and should not be duplicated by tags like "offline" or "connected".
3. **Surface** - featured / arcade / labs / archived. Already exists and should remain the curation/quality axis.

Do not add controlled facets or intent-family taxonomies right now.

Use:

- **Tags**: optional maker-supplied strings, search-only.
- **Collections**: editorial views over apps, not stored app identity.
- **Search**: the main 100+ app scale path.

## Proposed Category Vocabulary

Low-risk controlled set:

- `food-drink`
- `health-fitness`
- `social`
- `games`
- `tools`
- `creative`
- `productivity`
- `lifestyle`

Why include `productivity` and `lifestyle`: the platform already emits and displays them. Adding them to the controlled schema is less risky than forcing those existing concepts back into `tools`.

Do not add `finance` yet. Map money apps to `productivity` until there is enough volume to justify a dedicated category migration.

### Legacy Mapping

- `cooking` -> `food-drink`
- `fitness` -> `health-fitness`
- `wellness` -> `health-fitness`
- `health` -> `health-fitness`
- `creativity` -> `creative`
- `journal` -> `productivity`
- `money` -> `productivity`
- `memory` -> `lifestyle`
- `home` -> `lifestyle`
- `family` -> `lifestyle`
- `travel` -> `lifestyle`
- `productivity` -> `productivity`
- `social` -> `social`
- `games` -> `games`
- `tools` -> `tools`
- unknown -> reject for maker writes, report in audit for existing rows

## Implementation Plan

### Phase 0 - Reserved Slug Seed

This is first because it is cheap and protects live routes.

Files:

- `apps/platform/src/lib/server/db/schema/reserved-slugs.ts`
- new Drizzle migration under `apps/platform/drizzle/`
- tests under deploy/preflight or DB seed coverage

Tasks:

- Add missing live route slugs to `RESERVED_SLUGS_SEED`.
- Add a migration that inserts all seed rows with `INSERT OR IGNORE`.
- Include route-collision slugs: `run`, `you`, `c`, `glance`, `today`, `arcade`, `labs`, `auth`, `invite`.
- Keep admin suspension inserts as additive, not a replacement.
- Add a test or script assertion that every seed constant entry exists in the generated migration.

Exit criteria:

- Fresh D1 has reserved rows immediately after migrations.
- Deploying or renaming to `api`, `run`, `you`, `arcade`, etc. is blocked.

### Phase 1 - Category Enforcement At The Boundary

Files:

- `apps/platform/src/lib/curation/schema.ts`
- `apps/platform/src/lib/marketplace/display-text.ts`
- `apps/platform/src/lib/server/deploy/manifest.ts`
- `apps/platform/src/lib/server/deploy/pipeline.ts`
- `apps/platform/src/lib/server/deploy/wrap.ts`
- `apps/platform/src/routes/api/deploy/github/+server.ts`
- `apps/platform/src/routes/dashboard/apps/[slug]/profile/+page.server.ts`
- `apps/platform/src/routes/dashboard/apps/[slug]/profile/+page.svelte`
- `apps/platform/src/routes/apps/[slug]/+page.server.ts`
- `apps/platform/src/routes/apps/[slug]/+page.svelte`
- `apps/platform/src/routes/+page.server.ts`
- `apps/platform/src/routes/you/+page.server.ts`
- `apps/platform/src/lib/container/state.ts`

Tasks:

- Add `normalizeCategory(raw, mode)` to `curation/schema.ts`.
- Add `VALID_CATEGORIES` entries for `productivity` and `lifestyle`.
- Make all DB write paths call `normalizeCategory()`.
- Reject invalid maker-submitted categories at request boundaries.
- For generated/default flows, fallback to `tools` only when there is no maker intent.
- Replace dashboard category text inputs with a select backed by `VALID_CATEGORIES`.
- Remove duplicate `marketplaceCategory()` helpers from `/` and `/you`.
- Update `display-text.ts` to be a pure label map over the controlled vocab.
- Migrate `container/state.ts` category strings to controlled values at source.
- Add a one-off audit query/script to list existing `apps.category` values outside the controlled set.

Exit criteria:

- No write path can persist a category outside `VALID_CATEGORIES`.
- Browse filters only operate on controlled category values.
- `rg "marketplaceCategory" apps/platform/src/routes` returns no duplicate bridge.

### Phase 2 - Slug Alias And Rename Safety

Files:

- new schema table near `apps/platform/src/lib/server/db/schema/apps.ts`
- new migration under `apps/platform/drizzle/`
- `apps/platform/src/lib/server/db/queries/apps.ts`
- `apps/platform/src/routes/apps/[slug]/+page.server.ts`
- `apps/platform/src/routes/run/[slug]/+page.server.ts`
- `apps/platform/src/hooks.server.ts`
- `apps/platform/src/lib/showcase-slugs.ts`

Tasks:

- Add `app_slug_aliases`:
  - `slug`
  - `app_id`
  - `target_slug`
  - `reason`
  - `created_at`
  - `retired_at`
  - unique slug
- On every third-party rename, insert old slug as an alias before updating the app row.
- Resolve aliases in app detail, run route, and subdomain dispatch.
- Preserve query/search params like first-party aliases do today.
- Generalize first-party alias resolution so hardcoded aliases and DB aliases share one resolver.
- Decide 301 vs 302. Use 302 while rename semantics are still mutable; promote to 301 only for finalized first-party successor aliases.

Exit criteria:

- A renamed maker app keeps old `/apps/:old`, `/run/:old`, and subdomain links working.
- Alias resolution never lets a maker claim another app's retired slug.

### Phase 3 - Idempotent Runtime Rename

Files:

- `apps/platform/src/routes/apps/[slug]/+page.server.ts`
- `apps/platform/src/lib/server/deploy/kv-write.ts`
- `apps/platform/src/lib/server/deploy/r2-upload.ts`
- package artifact helpers in `apps/platform/src/lib/server/deploy/deploy-report.ts`
- offline capsule package in `packages/offline-capsule/src/index.ts`

Tasks:

- Make existing KV/R2 rename migration resumable and idempotent.
- Track migration state in D1 or KV:
  - pending
  - r2_copied
  - kv_copied
  - aliases_written
  - complete
  - failed_retryable
- Do not delete old KV keys until the new slug has verified active/meta/profile keys.
- Keep old R2 prefix readable through alias period.
- Add retry path from maker dashboard/admin.
- Long-term: migrate runtime storage to app-id keys with slug pointers:
  - `apps-by-id:{appId}:*`
  - `apps/{appId}/v{version}/...`
  - slug pointer -> app id

Exit criteria:

- Partial failure during rename can be retried without split-brain.
- Old slug continues to resolve while storage migration is in progress.

### Phase 4 - Stop Deriving Stable Identity From Slug

Files:

- `apps/platform/src/lib/server/deploy/pipeline.ts`
- `apps/platform/src/lib/server/deploy/manifest.ts`
- `packages/app-package-builder/src/index.ts`
- `packages/showcase-kit/src/boot.tsx`
- `packages/offline-capsule/src/index.ts`

Tasks:

- Package manifest `id` should use DB app id where available, not `app_${slug}`.
- Default Data Passport family should not change on rename.
- For new apps, derive fallback data family from immutable app id or an explicit `data_passport.family`.
- For existing apps, preserve the first deployed family unless the maker explicitly migrates.
- Add compatibility bridge for older packages whose manifest id is `app_${slug}`.
- Keep slug in package manifest as public handle, not identity.

Exit criteria:

- Renaming an app does not change package id or default data family.
- Data compatibility checks are stable across rename.

### Phase 5 - Remix Compatibility And Remix Studio Rules

Files:

- `apps/platform/src/lib/server/remix/eligibility.ts`
- `apps/platform/src/routes/api/apps/[slug]/remix/+server.ts`
- `apps/platform/src/routes/new/+page.server.ts`
- `apps/platform/src/routes/new/+page.svelte`
- `apps/platform/src/routes/api/deploy/+server.ts`
- `apps/platform/src/routes/api/deploy/trial/+server.ts`
- `apps/platform/src/routes/api/deploy/github/+server.ts`
- `packages/app-package-contract/src/index.ts`

Tasks:

- Load the latest package data passport for the parent app in remix eligibility.
- Include parent data family/schema in remix handoff response.
- On remix deploy, compare parent package data to child package data with `assessDataPassportCompatibility()`.
- Show one of:
  - same schema: data can stay in place
  - same family: compatible schema line
  - migration required
  - incompatible family
  - unknown
- Make remix depth explicit in Remix Studio:
  - inherit closed default
  - allow future remixes
  - require source repo + license before enabling
- Keep heavy arbitrary rebuilds in CLI/MCP.
- Allow in-browser remix only for local/static apps that do not need an untrusted build sandbox.

Exit criteria:

- Remix handoff explains data compatibility.
- Remix of a remix is a deliberate choice, not an accidental default.
- No Cloudflare-only untrusted build sandbox is assumed.

### Phase 6 - Logo Ingestion

Files:

- `apps/platform/src/lib/server/db/schema/apps.ts`
- dashboard profile route and UI
- marketplace icon components
- PWA/offline launcher icon extraction
- new R2 asset helper

Tasks:

- Replace public `iconUrl` entry with upload or ingest flow.
- Accept only HTTPS for remote ingestion.
- Fetch once server-side, validate size and MIME, then store in R2.
- Serve same-origin asset URLs.
- Generate variants: 64, 128, 256, 512.
- Sanitize SVG or defer SVG support until a sanitizer is in place.
- Keep monogram fallback.
- Add trademark/impersonation review affordance later.

Exit criteria:

- App drawer never hotlinks maker-controlled external icons.
- `http:` icon URLs are rejected.
- Offline/PWA launcher uses stable same-origin icons or monograms.

### Phase 7 - Discovery Rules For 100+ Apps

Files:

- marketplace page/loaders
- app drawer/launcher components
- saved/manage surfaces
- search/query helpers

Rules:

- Primary nav axes: Category, Kind, Surface.
- Tags are search-only.
- Collections are editorial.
- Drawer shows personal context first:
  - recent
  - pinned/saved
  - installed/offline
  - suggested
- Browse handles exploration:
  - category
  - kind
  - surface
  - search
  - remixable
- Avoid chip sprawl in the app drawer.

Exit criteria:

- 100 apps remains scan-friendly without adding more controlled taxonomies.
- Category chips do not become the primary scale mechanism.

## Edge Cases To Test

- Fresh database blocks all reserved route slugs.
- Existing DB rows with invalid categories are detected and migrated.
- GitHub deploy no longer persists `other`.
- Profile route rejects invalid categories.
- First-party fallback categories match generated curation.
- Maker rename creates slug alias.
- Old app detail/run/subdomain links redirect after rename.
- Rename migration can be retried after failure between R2 copy and KV copy.
- Package id is stable across rename.
- Default data passport family is stable across rename.
- Remix of renamed parent still points to parent app id, not stale slug.
- Remix of remix can be intentionally made remixable.
- External `http:` icon URL is rejected.
- External HTTPS logo is ingested and served same-origin.
- Offline launcher works when icon ingestion asset is unavailable.

## Non-Goals

- Building a full in-browser IDE for arbitrary apps.
- Adding controlled facets or intent-family taxonomies.
- Adding finance as a category before app volume justifies it.
- Building clone-flood detection before there is real maker volume.
- Solving homoglyph/confusable slug detection before route reservations and aliases are fixed.

## Suggested Implementation Order

1. Reserved slug seed migration.
2. Category normalizer and write-boundary enforcement.
3. Category source migration for `state.ts`, display labels, and browse loaders.
4. Slug alias table and resolver.
5. Idempotent rename migration.
6. Stable package id and data family defaults.
7. Remix data compatibility wiring.
8. Logo ingestion.
9. Discovery polish for 100+ apps.

This order keeps the first implementation sessions small and high-confidence while pushing the invasive identity/storage work behind the cheap safety fixes.
