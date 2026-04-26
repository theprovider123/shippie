# Self-Hosting Shippie

Shippie's platform is AGPL-licensed. You can run your own instance.

This guide covers two scenarios:

1. **Self-host the public platform** — run your own marketplace + wrapper + AI iframe on your own Cloudflare account.
2. **Self-host a Shippie Hub** — run a venue device on your own hardware (e.g., a Raspberry Pi at a school, pub, conference, festival) so devices on the local network can sync without internet.

These are independent. You can run a Hub without running the full platform; you can run the full platform without ever deploying a Hub.

The active Cloudflare-only deploy steps for the public platform live in [`docs/superpowers/plans/2026-04-26-prod-deploy-runbook.md`](./superpowers/plans/2026-04-26-prod-deploy-runbook.md). Anything in earlier specs that references `apps/web`, `services/worker`, or Vercel is pre-cutover and should not be followed.

---

## Scenario 1 — Self-host the public platform

### Prerequisites

- Cloudflare account with Workers, Pages, D1, R2, KV, Durable Objects enabled.
- A domain (e.g., `yourdomain.app`) with DNS managed by Cloudflare.
- `bun` 1.3+ installed locally.
- `wrangler` CLI authenticated (`bunx wrangler login`).

### Apps to deploy

| App | Where it lives | Deploy target |
|---|---|---|
| **Platform** | `apps/platform/` | Cloudflare Pages — your storefront, dashboard, deploy API, wrapper |
| **Shippie AI** | `apps/shippie-ai/` | Cloudflare Pages — the cross-origin AI iframe at `ai.yourdomain.app` |

### One-time Cloudflare setup

Create the resources the platform binds to:

```bash
# D1 database (matches the binding name in apps/platform/wrangler.toml)
bunx wrangler d1 create shippie-platform

# R2 buckets
bunx wrangler r2 bucket create shippie-apps
bunx wrangler r2 bucket create shippie-public

# KV namespace
bunx wrangler kv:namespace create SHIPPIE_KV
```

Update `apps/platform/wrangler.toml` with the IDs Cloudflare returns. Apply the schema:

```bash
cd apps/platform
bun run db:push   # applies packages/db/ migrations to your D1 instance
```

### Deploy the platform

```bash
cd apps/platform
bun run build
bunx wrangler pages deploy .svelte-kit/cloudflare --project-name shippie-platform
```

Set the following environment variables in the Pages project (Cloudflare dashboard → Pages → shippie-platform → Settings → Environment variables):

| Variable | Required | Description |
|---|---|---|
| `AUTH_SECRET` | Yes | `openssl rand -hex 32` — Lucia session secret |
| `AUTH_GITHUB_ID` | Yes | GitHub OAuth client ID (for maker sign-in) |
| `AUTH_GITHUB_SECRET` | Yes | GitHub OAuth client secret |
| `OAUTH_COORDINATOR_SECRET` | Yes | `openssl rand -hex 32` — guards the OAuth coordinator routes |
| `SHIPPIE_ENV` | Yes | `production` (enables secure-cookie + `.yourdomain.app` cookie scope) |
| `SHIPPIE_PUBLIC_HOST` | Yes | e.g., `yourdomain.app` |
| `GOOGLE_DRIVE_CLIENT_ID` | No | If you want Bring-Your-Own-Cloud backup to Google Drive |
| `GOOGLE_DRIVE_CLIENT_SECRET` | No | Matching secret |

### Deploy the AI iframe

```bash
cd apps/shippie-ai
bun run build
bunx wrangler pages deploy dist --project-name shippie-ai
```

Add a custom domain `ai.yourdomain.app` in the Pages project so the iframe URL matches the cross-origin contract the SDK expects.

### DNS

In your Cloudflare zone, add the following CNAME records (target = whatever Cloudflare assigns to your Pages projects):

- `@` (or apex) → `shippie-platform.pages.dev`
- `*` → same target — every maker app subdomain
- `cdn` → same target — for the hosted SDK
- `proximity` → same target — for the WebSocket signal endpoint
- `ai` → `shippie-ai.pages.dev`

### Smoke test

```bash
curl -sI https://yourdomain.app/                    # 200
curl -sI https://recipe.yourdomain.app/             # 200 (or 404 if no recipe app deployed yet — confirms wildcard routing)
curl -sI https://ai.yourdomain.app/                 # 200
```

Then sign in via the dashboard, deploy a showcase, and visit its slug subdomain.

### Scheduled jobs (cron)

`apps/platform/src/lib/server/cron/dispatch.ts` handles the scheduled tasks. Wrangler bindings:

```toml
# apps/platform/wrangler.toml
[triggers]
crons = ["*/5 * * * *", "0 * * * *", "0 4 * * *"]
```

| Cron | Job | Purpose |
|---|---|---|
| `*/5 * * * *` | `reconcileKv` | Reconcile KV cached metadata against D1 |
| `0 * * * *` | `reapTrials` + `rollups` | Reap trial deploys past TTL; aggregate analytics |
| `0 4 * * *` | retention | Daily retention reports |

Cloudflare invokes the platform's scheduled handler automatically — no separate cron runner needed.

---

## Scenario 2 — Self-host a Shippie Hub

A Hub is a small device on the local network that serves cached app bundles, coordinates the WebRTC mesh signalling, and (optionally) bridges live data into the mesh. Use it when devices need to talk to each other without the public internet — schools, pubs, conferences, festivals, disaster zones.

### What you need

- Any Linux box with Docker. A Raspberry Pi 4 with 4 GB RAM is plenty for a pub-quiz / classroom; a small NUC or VPS handles a venue. Power supply, ethernet (or strong WiFi).
- `services/hub/` from this repo.

### Run

```bash
cd services/hub
docker build -t shippie-hub .
docker run -d \
  --name shippie-hub \
  --network host \
  -e HUB_NAME="My Venue" \
  -e DATA_FEEDS='[]' \
  shippie-hub
```

The Hub advertises itself on the LAN via mDNS as `shippie-hub.local`. Devices running Shippie apps discover it automatically when they're on the same network.

### Optional — bridge live data

The Hub can pull external data (sports scores, news, weather) via a single internet connection and broadcast it through the mesh so every connected device sees the update. Configure feeds via `DATA_FEEDS` (JSON array):

```json
[
  {
    "name": "live-scores",
    "url": "https://api.example.com/v3/live",
    "poll_interval": 30,
    "auth": "Bearer ${API_KEY}",
    "broadcast_channel": "scores"
  }
]
```

### Pair with the public platform — optional

If you also self-host the public platform (Scenario 1), the Hub can sync its app cache directly from your `shippie-apps` R2 bucket. Otherwise it syncs from `shippie.app` by default. See `services/hub/README.md` for the cache configuration.

---

## Production considerations

- **Generate every secret with `openssl rand -hex 32`** — never reuse the placeholder values from `.env.example`.
- **Configure your own GitHub OAuth app** — don't share client IDs across instances.
- **Pick a region for D1** that's close to your maker base — D1 is replicated, but the primary region affects latency.
- **R2 multipart uploads** are not yet smoke-tested above 5 MiB at HEAD; if your makers ship large bundles, validate the multipart path on first deploy.
- **Cloudflare Calls (TURN)** is required for cross-NAT mesh sync. Local-network mesh works without it.

---

## Self-hosting troubleshooting

- **Wrangler authentication errors** — `bunx wrangler whoami` to confirm the right account.
- **D1 "table not found"** — re-run `bun run db:push` in `apps/platform/`.
- **Cookies don't survive cross-subdomain navigation** — confirm `SHIPPIE_ENV=production` so cookies are domain-scoped to `.yourdomain.app`.
- **AI iframe blank** — confirm `ai.yourdomain.app` resolves and the SDK's `apps/platform/src/lib/...` config points at it.

For deeper operational debugging, see `docs/CURRENT_STATE.md` for the live truth file and the active runbook at `docs/superpowers/plans/2026-04-26-prod-deploy-runbook.md`.
