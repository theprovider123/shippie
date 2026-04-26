# Production Deploy Runbook

> Cloudflare-only stack. Two deploy targets:
> - **Platform** (`apps/platform/`) → Cloudflare Pages — SvelteKit app handling marketplace, dashboard, deploy API, wrapper injection, subdomain routing.
> - **AI iframe** (`apps/shippie-ai/`) → Cloudflare Pages (separate project) — cross-origin iframe holding shared on-device micro-models.
>
> The pre-cutover separate `services/worker` Worker is **deleted**. Wrapper / subdomain routing now lives inside `apps/platform/src/hooks.server.ts` and is served by the same Pages deployment that hosts the platform UI.

**Account:** `582bea37051924b1cfeaec7b1cc42603` (devanteprov@gmail.com).
**Wrangler auth:** verify with `bunx wrangler whoami` before starting.

---

## What's already prepared

- `apps/platform/wrangler.toml` — D1 binding, R2 buckets (`shippie-apps`, `shippie-public`), KV namespace, Durable Object (`SignalRoom`), `*.shippie.app/*` routes.
- D1 schema — `packages/db/` migrations are committed; apply via `apps/platform`'s `db:push` against the prod D1 instance.
- `apps/shippie-ai/wrangler.toml` — Pages project config for the AI iframe.

---

## Step 1 — Platform deploy (Cloudflare Pages)

```bash
cd apps/platform

# First time only — create the Pages project:
bunx wrangler pages project create shippie-platform --production-branch main

# Apply D1 schema to production:
bun run db:push   # uses CF_ENV=production from wrangler.toml binding

# Build:
bun run build

# Deploy:
bunx wrangler pages deploy .svelte-kit/cloudflare --project-name shippie-platform
```

The build emits to `.svelte-kit/cloudflare/` (the SvelteKit Cloudflare adapter output). The runbook's wrap-worker post-build step (`apps/platform/scripts/wrap-worker-with-scheduled.mjs`) wires the `scheduled()` handler so cron triggers fire from the same Pages function.

After this deploy, `wrangler secret list` works for the Pages project.

---

## Step 2 — Platform secrets

```bash
cd apps/platform

# Generate once, save to a password manager:
openssl rand -hex 32   # → AUTH_SECRET (Lucia session)
openssl rand -hex 32   # → OAUTH_COORDINATOR_SECRET
openssl rand -hex 32   # → SHIPPIE_INTERNAL_CRON_TOKEN
```

Set the secrets via the dashboard (Pages → shippie-platform → Settings → Environment variables → Production) OR via wrangler:

```bash
bunx wrangler pages secret put AUTH_SECRET --project-name shippie-platform
bunx wrangler pages secret put OAUTH_COORDINATOR_SECRET --project-name shippie-platform
bunx wrangler pages secret put SHIPPIE_INTERNAL_CRON_TOKEN --project-name shippie-platform
bunx wrangler pages secret put AUTH_GITHUB_ID --project-name shippie-platform
bunx wrangler pages secret put AUTH_GITHUB_SECRET --project-name shippie-platform
```

Plaintext env vars (set via dashboard since they're non-secret config):

```
SHIPPIE_ENV         = production
SHIPPIE_PUBLIC_HOST = shippie.app
```

OAuth provider IDs (`AUTH_GOOGLE_ID`, `GOOGLE_DRIVE_CLIENT_ID`) come from Step 5.

---

## Step 3 — DNS (Cloudflare dashboard)

In the `shippie.app` zone, add CNAME records pointing to the Pages projects:

- `@` (apex) → `shippie-platform.pages.dev`
- `*` (CNAME) → `shippie-platform.pages.dev` — every maker app subdomain
- `cdn` (CNAME) → `shippie-platform.pages.dev` — for the hosted SDK
- `proximity` (CNAME) → `shippie-platform.pages.dev` — for the WebSocket signal endpoint
- `ai` (CNAME) → `shippie-ai.pages.dev`

In each Pages project, add the matching custom domain so Cloudflare provisions the cert.

**Why dashboard:** zone records are usually configured outside `wrangler` for safety. `wrangler dns` works but you're one typo away from black-holing the apex.

---

## Step 4 — AI iframe deploy (Cloudflare Pages, separate project)

```bash
cd apps/shippie-ai
bun install
bun run build

# First time only:
bunx wrangler pages project create shippie-ai --production-branch main

bunx wrangler pages deploy dist --project-name shippie-ai
```

Add the custom domain `ai.shippie.app` in the Pages project. Cloudflare auto-provisions the cert.

The AI iframe consumes the SDK via `import { LocalAIClient } from '@shippie/local-ai'` and exposes the postMessage inference router. No additional secrets — the Workbox SW caches micro-models on first fetch from the configured `remoteHost`.

---

## Step 5 — Google Cloud Console (manual)

1. Visit https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID → Web Application:
   - Authorized JavaScript origins: `https://shippie.app`
   - Authorized redirect URIs:
     - `https://shippie.app/auth/callback/google` (NextAuth-style Google provider — used by Lucia adapter)
     - `https://shippie.app/oauth/google-drive` (Bring-Your-Own-Cloud backup coordinator)
3. Enable the Google Drive API for the project (if you want Drive backups).
4. Drop client ID + secret into Step 2's env vars (`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`).

---

## Step 6 — First smoke

```bash
# After DNS propagation (~30s):
curl -sI https://shippie.app/                       # should return 200
curl -sI https://recipe.shippie.app/                # should return 200 (or 404 if no recipe app deployed yet — confirms wildcard routing works)
curl -sI https://ai.shippie.app/                    # should return 200 (the AI dashboard)
```

Visit `https://shippie.app/dashboard` in your browser. Sign in via GitHub. Deploy a showcase app via the dashboard. Visit its slug subdomain. Open the Enhancements tab.

---

## Rollback

```bash
# Pages (platform or AI iframe):
# Cloudflare dashboard → Pages → project → Deployments → "Promote previous"

# OR via CLI (lists all deployments, then promotes one):
bunx wrangler pages deployment list --project-name shippie-platform
bunx wrangler pages deployment activate <deployment-id> --project-name shippie-platform
```

---

## Known operational caveats

- **CF R2 multipart not smoke-tested at >5 MiB.** First production zip upload that exceeds 5 MiB validates the multipart path. If it fails, log + fall back to non-multipart for v1.
- **TURN fallback (Cloudflare Calls) not real-network-tested.** Local-network mesh works; cross-NAT mesh needs TURN credentials.
- **DurableObject `SignalRoom` not exercised under miniflare end-to-end.** Live DO routing only validated via signal-dev shim. First multi-device proximity session is the smoke.

---

## What I (Claude) cannot do for you

- Set `wrangler` secrets — needs the actual secret values from your password manager.
- Cloudflare dashboard clicks (DNS, Pages env vars, custom domain attachment).
- Google Cloud Console clicks (OAuth client creation, scope authorization).
- Sign in via GitHub — the OAuth handshake happens in your browser.

Everything else above is `bunx wrangler ...` commands you can run. If you want me to run any specific subset and stop before the destructive bits, say which.

---

## Migration notes (for sessions referencing earlier runbook versions)

The pre-2026-04-26 version of this runbook described:
- A separate `services/worker` deploy via `wrangler deploy` — **gone**, functionality merged into `apps/platform/src/hooks.server.ts`.
- An `apps/web` (Next.js) Pages deploy with `NEXTAUTH_URL`, `DATABASE_URL`, `WORKER_PLATFORM_SECRET`, `FUNCTIONS_MASTER_KEY`, `TRIAL_IP_SALT` — **gone**, replaced by SvelteKit + Lucia + D1.

If you see steps in older docs/plans that reference those targets, treat them as historical and follow this runbook instead.
