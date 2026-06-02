# Shippie contracts

The stable surfaces a tool (or another implementation) builds against. Each section
points to the **authoritative code** — these docs describe it, they don't redefine it,
so they can't drift. Versioned: contracts carry an explicit `v1`-style version.

## 1. Manifest — `shippie.json`
What a tool *is*: identity, capabilities, data, source/provenance.

- **Schema:** [`/schemas/app.json`](../../apps/platform/static/schemas/app.json) (JSON Schema draft-07). Add `"$schema": "https://shippie.app/schemas/app.json"` to a manifest for editor autocomplete + validation.
- **Authoritative parse:** `ShippieJsonLite` in `apps/platform/src/lib/server/deploy/manifest.ts` (the lenient subset the deploy pipeline reads).
- Anything not declared is denied by the wrapper/CSP. `allowed_connect_domains` must enumerate every outbound host, or the tool is local-only.

## 2. Intents — cross-tool wiring
How tools hand data to each other on-device, without a server.

- **Catalog:** `CANONICAL_INTENTS` in `packages/intents/src/index.ts`. Versioned ids, e.g. `meals.log.v1`, `pantry.inventory.v1`, `shopping.list.v1`, `workout.session.v1`, `sleep.entry.v1`.
- **Aliases:** `LEGACY_INTENT_ALIASES` maps older free-form ids onto canonical ones, so existing manifests keep working.
- A manifest declares `intents.provides` / `intents.consumes`; the container routes payloads between iframes locally.

## 3. Permissions / trust — `shippie.permissions.v1`
What a tool is allowed to touch.

- **Authoritative:** `SHIPPIE_PERMISSIONS_SCHEMA` + the capability types in `packages/app-package-contract/src/index.ts` (`localDb`, `localFiles`, `network`, `feedback`, `analytics`; `system.*` is never granted to iframe apps).
- Manifest `permissions` (`auth`/`storage`/`files`/`notifications`/`analytics`/`external_network`) compiles down to these capabilities + the CSP at deploy time.

## 4. Local runtime + offline guarantees
What "local-first" actually promises.

- **Runtime contract:** `packages/local-runtime-contract/src/` — `LocalAiAvailability` (capability detection), `ShippieLocalAi`, and `.shippiebak` backup header (`SHIPPIE_BACKUP_MAGIC`, quota thresholds).
- On-device storage/files/AI run via OPFS/WASM/WebGPU; backup/restore is the user's portable `.shippiebak`. The platform hosts the *package*, not the data.

## 5. Provenance + lineage
Where a tool came from, and how a remix stays honest. See [`provenance.md`](provenance.md).
