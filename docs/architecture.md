# Architecture

Shippie is a post-cloud app platform. The public story is **Wrap. Run. Connect.**

- **Wrap** — deploy any web app, Shippie makes it installable, offline-capable, faster, and more tactile.
- **Run** — everything runs on the user's device: local DB, files, AI, intelligence, backup, data ownership.
- **Connect** — nearby devices talk directly via real-time rooms, peer-to-peer sync, offline propagation.

Underneath the public story, the platform is composed of nine engineering components: **Shell, Boost, Sense, Core, AI, Vault, Pulse, Spark, Hub.** Documentation, the SDK, and the whitepaper map them in detail; product surfaces never expose all nine at once.

## Stack

The SvelteKit + Cloudflare cutover shipped on 2026-04-26 (commit `56179bf`). Pre-cutover services (`apps/web`, `services/worker`, `packages/cf-storage`, `vercel.json`) are removed. Treat anything referencing them as historical.

| Concern | Technology |
|---|---|
| Platform app | SvelteKit (`apps/platform/`) on Cloudflare Pages |
| Wrapper / subdomain routing / wrap injection | Cloudflare Workers via SvelteKit's `hooks.server.ts` |
| Database | Cloudflare D1 (SQLite at the edge) — schema in `packages/db/` |
| File storage | Cloudflare R2 (`shippie-apps`, `shippie-public`) |
| Cache / KV | Cloudflare KV |
| Real-time signalling | Cloudflare Durable Objects (`SignalRoom`) |
| AI iframe | `apps/shippie-ai/` (Vite + vite-plugin-pwa) on Cloudflare Pages, served at `ai.shippie.app` |
| Local-runtime engines | wa-sqlite (`packages/local-db/`), OPFS (`packages/local-files/`), Transformers.js / WebNN (`packages/local-ai/` + the iframe app) |
| Mesh transport | WebRTC peer-to-peer over Durable Object signalling |
| Hub (venue) | Bun + Docker (`services/hub/`) — mDNS + WebSocket signal, app/model cache |
| Build runner | GitHub Actions for repo-based deploys |

## Repo layout

```
apps/
  platform/                 SvelteKit + Cloudflare — marketplace, dashboard, deploy API, wrapper (AGPL)
  shippie-ai/               Cross-origin AI iframe at ai.shippie.app — Vite + Workbox SW (AGPL)
  showcase-recipe/          Demo: local DB + offline cooking
  showcase-journal/         Demo: local DB + patina + extractive summaries
  showcase-whiteboard/      Demo: real-time collaboration (Pulse)
  showcase-live-room/       Demo: pub-quiz / classroom Live Room (Pulse + Sense)

packages/
  sdk/                      @shippie/sdk — client SDK for deployed apps (MIT)
                            subpath exports: ./native, ./wrapper
  cli/                      @shippie/cli — terminal deploy tool (MIT)
  mcp-server/               @shippie/mcp — MCP server for AI tools (MIT)
  pwa-injector/             Manifest + service worker generation
  local-db/                 wa-sqlite + IndexedDB fallback
  local-files/              OPFS path abstraction
  local-ai/                 LocalAI bridge spec (consumed by sdk)
  local-runtime/            DB + telemetry orchestration
  local-runtime-contract/   Shared local-runtime types
  ambient/                  Background analysis scheduler + insight surfacing
  intelligence/             Spatial memory, pattern tracking, predictive preload, recall
  proximity/                Rooms, WebRTC, gossip, transfer primitives
  backup-providers/         Encrypted backup adapters (iCloud, Google Drive, Dropbox)
  session-crypto/           Encryption helpers
  analyse/                  HTML/CSS/JS scanner → AppProfile → enhance rule compilation
  access/                   OAuth + OIDC adapters
  shared/                   Shared project types
  db/                       Drizzle schema + D1 migrations
  dev-storage/              Local dev IndexedDB / KV simulator

services/
  hub/                      Self-hosted venue device — Bun server + Docker, mDNS + WS signalling

docs/
  CURRENT_STATE.md          Living truth file — read first
  architecture.md           This file
  self-hosting.md           Run your own instance
  superpowers/plans/        Active and archived design plans
```

The umbrella plan and Non-Negotiables live at `/Users/devante/.claude/plans/review-all-of-this-swift-token.md`. The active build roadmap is `docs/superpowers/plans/2026-04-25-intelligence-layer-roadmap.md`.

## Workspace package boundaries

Internal packages (`@shippie/proximity`, `@shippie/local-db`, `@shippie/ambient`, etc.) expose `exports` pointing at TypeScript source, not built `dist/`:

```json
"exports": {
  ".": {
    "types": "./src/index.ts",
    "import": "./src/index.ts"
  }
}
```

This pattern keeps typecheck immune to build state. Vite (used by SvelteKit + the AI iframe) and Bun both transpile TS source natively, so production builds work the same way. Build artifacts are still generated via tsup for any future external consumers; right now every workspace package is `private: true`.

## What runs where

```
                  ┌─────────────────────────────────────────────┐
                  │                Cloudflare                    │
                  │                                              │
  Maker pushes    │    Pages (apps/platform)                     │
  → GitHub Action │    │                                         │
  → R2 upload     │    │── hooks.server.ts (subdomain router)    │
                  │    │      ├─ shippie.app → SvelteKit app    │
                  │    │      └─ *.shippie.app → wrap injector   │
                  │    │                                         │
                  │    ├── D1 (apps, deploys, room_audit, …)     │
                  │    ├── R2 (shippie-apps, shippie-public)     │
                  │    ├── KV (cached metadata)                  │
                  │    └── Durable Object (SignalRoom)           │
                  │                                              │
                  │    Pages (apps/shippie-ai) → ai.shippie.app  │
                  │    └── Workbox SW caches micro-models in     │
                  │        Cache Storage on first fetch          │
                  │                                              │
                  │    Workers AI (edge inference fallback)      │
                  └─────────────────────────────────────────────┘
                                      ↑
   User device (browser) ─────────────┤
   - SDK runtime (auth, db, files, AI bridge, observe)
   - Local DB (wa-sqlite + OPFS)
   - Local AI (postMessage to ai.shippie.app iframe)
   - WebRTC peer-to-peer to other nearby devices
   - Optional: Hub on the LAN for venue mesh
```

Maker code is delivered as static files from R2; the Worker injects the wrapper script + manifest + SW around every HTML response. End-user data lives on the user's device. Shippie holds platform metadata (listings, feedback, room audit) in D1 — never per-user app data.

## Deploy paths

| Path | How | Time-to-URL |
|---|---|---|
| **CLI** | `shippie deploy ./dist` | ~30 s |
| **Web upload** | drag a built zip at `shippie.app/new` | ~30 s |
| **MCP** | "deploy this to Shippie" inside Claude Code / Cursor | ~60 s |
| **GitHub** | push to a connected repo | ~10 s to placeholder, ~2–5 min to built (GitHub Actions runner) |

Pre-built paths (CLI, web upload, MCP) hit the fast lane. Repo-based deploys go through GitHub Actions; the build runs on GitHub's disposable VMs, never on Shippie infrastructure, so untrusted code never executes inside the platform's blast radius.

## Licensing

- **Platform** (`apps/platform`, `apps/shippie-ai`, `services/hub`, `packages/pwa-injector`, `packages/db`): [AGPL-3.0](../LICENSE). Fork and self-host freely; network-accessible modifications must publish under the same licence.
- **SDK / CLI / MCP server / shared / templates**: [MIT](../LICENSE-MIT). Link into your apps without constraint.

See [self-hosting.md](./self-hosting.md) for running your own instance.
