# Architecture

Shippie is a marketplace and runtime for **local tools** — apps that run on the user's device, store data locally, work offline, and connect to other Shippie tools through user-controlled primitives.

- **Local** — apps keep user data on the device by default.
- **Private** — no third-party user-data stores, trackers, or ads in the public tool surface.
- **Connected** — tools share signals through intents and encrypted relay when the user opts in.

## Stack

| Concern | Technology |
|---|---|
| Platform app | SvelteKit + `adapter-cloudflare-workers` (`apps/platform/`) |
| Request routing | Single Cloudflare Worker — handles `shippie.app` + `*.shippie.app` |
| Subdomain isolation | `HTMLRewriter` injects SDK wrapper + CSP headers on every maker-app HTML response |
| Database | Cloudflare D1 (SQLite via Drizzle ORM) — schema in `packages/db/` |
| File storage | Cloudflare R2 — maker app zip bundles (versioned) + showcase assets |
| Cache / KV | Cloudflare KV — rate limiting, app metadata cache, suspension keys, session context |
| Auth | Lucia (session-based, stored in D1 + KV) |
| First-party showcases | Bundled into `static/__shippie-run/` at build time, served via ASSETS binding |
| Build runner | GitHub Actions for repo-connected deploys |

## Request routing

```
Browser request
       |
       +-- shippie.app/* ---------> SvelteKit routes (platform UI + API)
       |
       +-- <slug>.shippie.app/* --> Worker detects subdomain
                                         |
                                         +-- slug in KV/D1? --> fetch zip from R2
                                         |                       HTMLRewriter injects
                                         |                       wrapper + manifest + SW
                                         |
                                         +-- slug in __shippie-run/? --> ASSETS binding
                                                                         (first-party showcases)
```

## Auth

- Sessions managed by Lucia; session token stored in a cookie.
- D1 holds `users`, `sessions`, and `oauth_accounts` tables.
- KV caches session context for hot paths.
- Magic-link email is the primary auth flow; OAuth adapters in `packages/access/`.

## Storage layout

| Store | What lives there |
|---|---|
| D1 | Users, sessions, apps, versions, feeds, feedback_items, app_reports, leaderboards |
| R2 | Versioned maker app zip bundles, extracted static assets |
| KV | Session context, app metadata cache, suspension keys (`suspend:<slug>`), rate limit counters |

End-user app data lives on the user's device (local SQLite/OPFS). Shippie holds platform metadata only — never per-user app data.

## Maker app lifecycle

```
Maker uploads zip (CLI / web / MCP)
          |
          v
  Policy scanner (packages/analyse/)
  -- blocks: external auth, trackers, bundled secrets, insecure transports
  -- flags: external AI, third-party services (disclosed via transparency badges)
          |
          v
  Zip stored in R2 (versioned)
  App record written to D1
  KV metadata cache populated
          |
          v
  <slug>.shippie.app live
  Worker serves files from R2 + injects wrapper on HTML responses
  Suspension: writing suspend:<slug> to KV stops serving immediately
```

## Deploy paths

| Path | How | Time-to-URL |
|---|---|---|
| **CLI** | `shippie deploy ./dist` | under a minute |
| **Web upload** | drag a built zip at `shippie.app/new` | under a minute |
| **MCP** | "deploy this to Shippie" inside Claude Code / Cursor | under a minute |
| **GitHub** | push to a connected repo | ~10 s placeholder, ~2-5 min built (GitHub Actions) |

Pre-built paths (CLI, web, MCP) are fast-lane. GitHub deploys build on GitHub's VMs — untrusted code never executes inside Shippie infrastructure.

## Repo layout

```
apps/
  platform/          SvelteKit + Cloudflare Worker — marketplace, auth, deploy API,
                     subdomain wrapper, Feed Protocol, maker backend (AGPL)

packages/
  sdk/               @shippie/sdk — client SDK for deployed apps (MIT)
  cli/               @shippie/cli — terminal deploy tool (MIT)
  mcp-server/        @shippie/mcp — MCP server for AI-editor deploys (MIT)
  db/                Drizzle schema + D1 migrations
  analyse/           Policy scanner — HTML/CSS/JS -> AppProfile + Local Tool verdict
  access/            OAuth + OIDC adapters
  pwa-injector/      Manifest + service worker generation
  local-db/          wa-sqlite + IndexedDB fallback
  local-files/       OPFS path abstraction
  local-ai/          LocalAI bridge spec
  proximity/         Rooms, WebRTC, gossip, transfer primitives
  session-crypto/    Encryption helpers
  shared/            Shared project types

docs/
  CURRENT_STATE.md   Living truth file — read first
  architecture.md    This file
  self-hosting.md    Run your own instance
  superpowers/plans/ Active and archived design plans
```

## Platform nav (June 2026)

Three primary routes — no separate Create or Access nav items:

- **Dock** — your installed apps, recents, pending updates
- **Tools** — marketplace discovery and search
- **You** — identity, your data, settings, help

## Safety

- Policy scanner runs at every upload (CLI, web, MCP, GitHub).
- Suspension: set `suspend:<slug>` in KV to stop serving a maker app immediately.
- `app_reports` table in D1 receives user reports; maker is notified.
- Behavior delta monitoring flags unexpected permission changes between versions.
- Transparency badges surface when an app uses an external service, AI provider, or creator-hosted endpoint.

## Feed Protocol

D1-backed public feeds per app, addressed by `slug/feedId`. Apps write events via the platform API; consumers poll or subscribe. Used by Golazo leaderboards, showcase apps, and future real-time surfaces.

## Workspace package boundaries

Internal packages expose `exports` pointing at TypeScript source, not built `dist/`:

```json
"exports": {
  ".": { "types": "./src/index.ts", "import": "./src/index.ts" }
}
```

Typecheck is immune to build state. Vite (SvelteKit) and Bun both transpile TS source natively. Every workspace package is `private: true`.

## Licensing

- **Platform** (`apps/platform`, `packages/db`, `packages/pwa-injector`): AGPL-3.0.
- **SDK / CLI / MCP / shared**: MIT.

See `docs/self-hosting.md` for running your own instance.
