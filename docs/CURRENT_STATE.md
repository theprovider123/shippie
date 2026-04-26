# Shippie — Current State

> Living truth file. If a doc, plan, or memory disagrees with this, **trust this file**. Re-verify against HEAD before encoding any new claims into a plan.
>
> **Last updated:** 2026-04-26
> **HEAD commit:** `56179bf` and later (post-cutover)

This file replaces stale assumptions about Shippie's architecture. Read it before planning anything.

---

## What Shippie is

Shippie is a post-cloud app platform. The public story is **Wrap. Run. Connect.**

- **Wrap** — deploy any web app, Shippie makes it installable, offline-capable, faster, more tactile.
- **Run** — everything runs on the user's device: local DB, files, AI, intelligence, backup, data ownership.
- **Connect** — nearby devices talk directly via real-time rooms, peer-to-peer sync, offline propagation.

Internally, the platform is composed of nine engineering components: **Shell, Boost, Sense, Core, AI, Vault, Pulse, Spark, Hub.** Do not expose all nine externally — they are docs / SDK architecture detail.

For the full vision, phased plan, and Non-Negotiables, see `/Users/devante/.claude/plans/review-all-of-this-swift-token.md`.

---

## Architecture (HEAD reality)

The SvelteKit + Cloudflare cutover shipped on 2026-04-26 (commit `56179bf`).

- `apps/platform/` — SvelteKit + Cloudflare Workers + D1 / R2 / KV / Durable Objects. The blessed platform app.
- `apps/shippie-ai/` — Cross-origin AI iframe (Vite + vite-plugin-pwa). Runs micro-models via Workbox-cached Service Worker.
- `apps/showcase-{recipe,journal,whiteboard,live-room}/` — Demo apps used to prove the wrapper end-to-end.
- `services/hub/` — Self-hosted venue device (Bun server, mDNS, WebSocket signal). Active.
- `services/worker/` — **DELETED.** Functionality ported into `apps/platform/src/lib/server/wrapper/`.
- `apps/web/` — **DELETED.** Was the legacy Next.js platform.
- `packages/cf-storage/` — **DELETED.** Replaced by native `event.platform.env.*` Cloudflare bindings.
- `vercel.json` — **DELETED.** Stack is Cloudflare-only.

### Workspace packages (verified at HEAD)

- `packages/sdk` — `@shippie/sdk` v2. Client SDK (auth, storage, files, feedback, analytics, install, native bridge, lazy-loaded local groups via proximity). Subpath exports: `./native`, `./wrapper`.
- `packages/pwa-injector` — Manifest + Service Worker generation.
- `packages/local-db` — wa-sqlite + IndexedDB fallback.
- `packages/local-files` — OPFS path abstraction.
- `packages/local-ai` — LocalAI bridge spec; iframe lives at `apps/shippie-ai`.
- `packages/local-runtime` — DB + telemetry orchestration.
- `packages/local-runtime-contract` — Shared local-runtime types.
- `packages/ambient` — Background analysis scheduler + insight surfacing.
- `packages/intelligence` — Spatial memory, pattern tracking, predictive preload, temporal context, recall.
- `packages/proximity` — Rooms, WebRTC, gossip, transfer primitives.
- `packages/backup-providers` — Encrypted backup adapters (iCloud, Google Drive, Dropbox).
- `packages/session-crypto` — Encryption helpers.
- `packages/analyse` — HTML/CSS/JS scanner → AppProfile → enhance rule compilation.
- `packages/access` — OAuth + OIDC adapters.
- `packages/shared` — Shared project types.
- `packages/cli` — `shippie deploy ./dist`.
- `packages/mcp-server` — Claude Code MCP server.
- `packages/db` — Drizzle schema + D1 migrations.
- `packages/dev-storage` — Local dev IndexedDB / KV simulator.

---

## Current Component Status

Tier ladder: **Foundation built → Demo-ready → Launch-ready → Partial → Not built.**

| Internal component | Layer | Status | Notes |
|--------------------|-------|--------|-------|
| Shell | Wrap | Foundation built | Wrapper primitives at `packages/pwa-injector/`, `packages/sdk/src/wrapper/install-prompt.ts`, `packages/sdk/src/wrapper/push.ts`. Launch readiness depends on real-device install / offline proof on iOS Safari + Android Chrome. |
| Boost | Wrap | Foundation built | DOM observer + capability gate + rules engine at `packages/sdk/src/wrapper/observe/`, `packages/analyse/`, `packages/sdk/src/wrapper/rules/`. AppProfile auto-detection (Plan B) not yet shipped. |
| Sense | Wrap | Foundation built | Full feel layer at `packages/sdk/src/wrapper/{haptics,spring,gestures,view-transitions,theme-color,textures,patina,your-data-panel,group-moderation-panel,insight-card}`. Demo-ready depends on showcase apps proving textures and patina in real use. |
| Core | Run | Foundation built | Local DB / files / runtime primitives at `packages/local-db/`, `packages/local-files/`, `packages/sdk/src/local.ts`, `packages/intelligence/`, `packages/local-runtime/`. Launch readiness depends on real-device proof, migration handling, quota behaviour, and recovery flows. |
| AI | Run | Partial | `apps/shippie-ai/` runs 5 inference tasks via postMessage. WebNN three-tier (NPU → GPU → WASM) detection exists but `source` field missing from inference responses; no UI surfacing backend choice. |
| Vault | Run | Partial | `packages/sdk/src/wrapper/your-data-panel.ts` + `packages/backup-providers/` exist. OAuth-to-user-cloud bridge route now wired at `apps/platform/src/routes/oauth/[provider]/+server.ts` (8/8 envelope round-trip + redirect tests). Device transfer flow primitives in `packages/proximity/src/transfer.ts`; UI integration with `your-data-panel` is the remaining gap. |
| Pulse | Connect | Foundation built | Proximity primitives + signalling at `packages/proximity/`, `services/hub/src/signal.ts`, D1 `room_audit` table. Platform-side `SignalRoom` DO + `/__shippie/signal/[roomId]` route now wired (`apps/platform/src/lib/server/proximity/signal-room.ts`, wrangler.toml v3 migration, wrap-worker bundles + re-exports the class, 9/9 routing tests). Live Room still needs real-device demo. |
| Spark | Connect | Not built | Roadmapped. No BLE beacon, no hotspot handoff, no chain propagation. |
| Hub | Connect | Partial | `services/hub/` runs mDNS + WS signalling and caches apps / models. Cloud bridge for offline-collected data and multi-Hub mesh not built. |

---

## Build / Typecheck / Test status (HEAD)

Captured 2026-04-26 after Phase 0 fixes.

### Typecheck — **PASS**

```
turbo run typecheck --force
Tasks:    26 successful, 26 total
```

All 26 packages typecheck cleanly. The earlier `apps/shippie-ai/src/sw.ts` TS2717 (Workbox `__WB_MANIFEST` type conflict) is fixed by removing the conflicting local `declare global` block — Workbox's own ambient declaration is now trusted.

### Build — **PASS**

```
turbo run build --force
Tasks:    24 successful, 24 total
```

The earlier `packages/local-db/src/wa-sqlite.d.ts` rollup-plugin-dts error ("namespace child (hoisting) not supported yet") is fixed by switching from `export default factory` (referencing a `const`) to `export default function factory()` — hoisting-safe.

### Test — **PASS**

```
turbo run test
Tasks:    31 successful, 31 total
```

`@shippie/platform`: **29 test files, 223 tests passing, 0 failing.** (+2 files, +17 tests added by Phase 1 + Phase 4 work — OAuth coordinator route and SignalRoom DO routing.)

The earlier 13-suite failure (`Failed to load url bun:test`) is fixed by migrating those test files from Bun's `bun:test` runner to Vitest (the platform's actual test runner per its `package.json` script: `"test": "vitest run"`). The migration was:

- 12 files: changed `from 'bun:test'` to `from 'vitest'` — APIs (`describe`, `it`, `expect`, `beforeEach`, `afterEach`) are 1:1 compatible.
- 2 files (`src/routes/admin/page.server.test.ts` + `src/routes/admin/audit/page.server.test.ts`): also replaced Bun's `mock.module(specifier, factory)` with Vitest's `vi.mock(specifier, factory)`. Vitest hoists `vi.mock` calls automatically, matching `mock.module` semantics.

Note: Vitest emits `close timed out after 10000ms — Tests closed successfully but something prevents Vite server from exiting` after a green run. Tests pass; only the Vite dev-server cleanup hangs. Tracked separately, not a blocker.

### Health (composite) — **PASS**

The root `bun run health` script runs typecheck + test + build in sequence. After Phase 0:

```
$ bun run health
# turbo run typecheck:  26/26 ✓
# turbo run test:       31/31 ✓
# turbo run build:      24/24 ✓
```

Green = baseline acceptable.

---

## Known live bugs / brittleness fixed in Phase 0

| Issue | Location | Fix |
|-------|----------|-----|
| TS2717 — `__WB_MANIFEST` type conflict | `apps/shippie-ai/src/sw.ts` | Removed local `declare global` block; trust Workbox's own ambient declaration. |
| rollup-plugin-dts namespace hoisting failure | `packages/local-db/src/wa-sqlite.d.ts` | Switched `export default factory;` (referencing a `const`) to `export default function factory()`. |
| Race: `sdk` typecheck loses `proximity` types when build cleans dist concurrently | `packages/proximity/package.json` | Switched `exports` from `./dist/*` to `./src/index.ts` — workspace consumers now read source. Matches the pattern already used by `local-db`, `ambient`, `backup-providers`, `intelligence`. |
| 14 platform test suites fail to load with `Failed to load url bun:test` | `apps/platform/src/{routes,lib/server,scripts}/**/*.test.ts` | Migrated all 14 from `bun:test` to `vitest` (the platform's actual runner). Two files using `mock.module` switched to `vi.mock`. |

---

## False alarm bugs (do not re-verify, do not fix)

These were reported in earlier code review but are wrong at HEAD:

- ❌ `manifest.ts:84` references undefined `deriveShortName`. **FALSE** — defined at `apps/platform/src/lib/server/wrapper/router/manifest.ts:126`.
- ❌ `files.ts` SPA fallback fails with `ERR_STREAM_CANNOT_PIPE`. **FALSE** — body is read once via `arrayBuffer()` at `apps/platform/src/lib/server/wrapper/router/files.ts:71`; HTML and binary paths use independent streams.
- ❌ `access-gate.test.ts:79` private invite cookie returns 401. **FALSE** — test passes; assertion is `expect(res).toBeNull()` and `verifyInviteGrant` allows correctly.
- ❌ `cron/dispatch.test.ts:36` `vi.mocked` not in Bun. **FALSE** — `apps/platform` uses Vitest, so the import is correct.

---

## Active roadmap

The active build roadmap lives at `docs/superpowers/plans/2026-04-25-intelligence-layer-roadmap.md`. The decomposed plans are:

- Plan A — WebNN hardware acceleration (`2026-04-26-webnn-hardware-acceleration.md`)
- Plan B — Zero-config pipeline + WASM auto-detect (`2026-04-26-zero-config-pipeline-and-wasm.md`)
- Plan C — Sensory textures + patina (`2026-04-26-sensory-textures-and-patina.md`)
- Plan D1 — Adaptive intelligence core (`2026-04-26-adaptive-intelligence-d1-core.md`)
- Plan D2 — Adaptive intelligence experimental (`2026-04-26-adaptive-intelligence-d2-experimental.md`)
- Plan E — Ambient intelligence (`2026-04-26-ambient-intelligence-e.md`) — **shipped**
- Plan F — Cross-app intents + knowledge graph (`2026-04-26-cross-app-intents-and-knowledge-graph-f.md`) — deferred to demand-pulled
- Plan G — Maker dashboard + compliance (`2026-04-26-maker-dashboard-and-compliance.md`)
- Live Room showcase (`2026-04-26-live-room-showcase.md`)
- Production deploy runbook (`2026-04-26-prod-deploy-runbook.md`) — partially stale; see notes in that file

The umbrella plan (Wrap / Run / Connect, the six phases, Non-Negotiables, the Proof spine) lives at `/Users/devante/.claude/plans/review-all-of-this-swift-token.md`.

---

## Stale docs that should NOT be trusted

These reflect pre-cutover architecture and have not yet been rewritten:

- `docs/architecture.md` — references `apps/web/`, `services/worker/`, Postgres+Drizzle, Supabase BYO. All wrong post-cutover.
- `docs/self-hosting.md` — references docker-compose with Postgres 16, Next.js env vars (NEXTAUTH_*, DATABASE_URL=postgres). All wrong post-cutover.
- `docs/superpowers/plans/2026-04-26-prod-deploy-runbook.md` — Steps 1–4 reference deleted `services/worker` and `apps/web`. Step 5 (`apps/shippie-ai` deploy) is still accurate. Use with caution.
- `docs/shippie-refactoring-plan-v5.md` — historical refactor plan; predates cutover.
- All `docs/superpowers/plans/2026-04-2{1,2,3,4}-*.md` — historical phase plans. Treat as archived.

These will be rewritten or marked archived as part of Phase 0 task #6.
