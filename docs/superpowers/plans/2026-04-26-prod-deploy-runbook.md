# Production Deploy Runbook

> Cloudflare-only stack. Three deploy targets: the Worker (`*.shippie.app`), the control plane (`apps/web` → Cloudflare Pages), and the AI iframe app (`apps/shippie-ai` → separate Cloudflare Pages project).

**Account:** `582bea37051924b1cfeaec7b1cc42603` (devanteprov@gmail.com).
**Wrangler auth:** ✅ already logged in (verified via `bunx wrangler whoami`).

---

## What's already prepared (CLI)

- `services/worker/wrangler.toml` — KV namespace `caa6a30a2af640a68305fefd4348a6e1`, R2 buckets `shippie-apps` + `shippie-public`, Durable Object `SignalRoom` migration v1, routes `*.shippie.app/*` + `cdn.shippie.app/*`, all wired.
- The worker has not been deployed yet — `wrangler secret list` errored "Worker shippie-worker not found". `wrangler deploy` is the FIRST production deploy.

---

## Step 1 — Worker deploy (CLI; safe, idempotent)

```bash
cd services/worker
bunx wrangler deploy
```

Expected: creates the worker, prints the deployed URL pattern. After this, `wrangler secret list` will work.

---

## Step 2 — Worker secrets (CLI; needs you to supply secret values)

```bash
cd services/worker
# Generate once, save to a password manager:
openssl rand -hex 32  # → use as WORKER_PLATFORM_SECRET
bunx wrangler secret put WORKER_PLATFORM_SECRET
# Paste the value when prompted.
```

If your worker uses additional secrets (check `services/worker/src/index.ts` for `env.X` references), put them too.

---

## Step 3 — DNS (Cloudflare dashboard, manual)

In the `shippie.app` zone, add:

- `*` (CNAME) → `<your-worker>.workers.dev` — covers every maker app subdomain
- `cdn` (CNAME) → same target — for the hosted SDK
- `proximity` (CNAME) → same target — for the WebSocket signal endpoint
- `ai` (CNAME) → the Cloudflare Pages target you'll create in Step 5

**Why dashboard:** zone records are usually configured outside `wrangler` for safety. `wrangler` can do it (`wrangler dns`) but you'd be one typo away from black-holing the apex.

---

## Step 4 — `apps/web` (control plane) deploy

The control plane is a Next.js App Router app. It needs to be a separate Cloudflare Pages project.

```bash
cd apps/web
# First time only — create the Pages project:
bunx wrangler pages project create shippie-web --production-branch main

# Deploy:
bun run build
bunx wrangler pages deploy .next --project-name shippie-web
```

**Env vars** to set in the Pages project (Cloudflare dashboard → Pages → shippie-web → Settings → Environment variables):

```
DATABASE_URL                 = postgres://... (your prod Postgres)
AUTH_SECRET                  = openssl rand -hex 32
AUTH_GOOGLE_ID               = (Google OAuth client ID — see Step 6)
AUTH_GOOGLE_SECRET           = (Google OAuth client secret)
OAUTH_COORDINATOR_SECRET     = openssl rand -hex 32
GOOGLE_DRIVE_CLIENT_ID       = (same client as AUTH_GOOGLE_ID OR a separate one)
GOOGLE_DRIVE_CLIENT_SECRET   = (matching secret)
SHIPPIE_ENV                  = production
CF_ACCOUNT_ID                = 582bea37051924b1cfeaec7b1cc42603
CF_API_TOKEN                 = (create a token with KV:write + R2:write scoped to your account)
CF_KV_NAMESPACE_ID           = caa6a30a2af640a68305fefd4348a6e1
CF_R2_APPS_BUCKET            = shippie-apps
CF_R2_PUBLIC_BUCKET          = shippie-public
SHIPPIE_PUBLIC_HOST          = shippie.app
```

After env vars are set, redeploy: `bunx wrangler pages deploy .next --project-name shippie-web`.

---

## Step 5 — `apps/shippie-ai` deploy

```bash
cd apps/shippie-ai
bun install
bun run build
bunx wrangler pages project create shippie-ai --production-branch main  # first time
bunx wrangler pages deploy dist --project-name shippie-ai
```

Then in the Pages project: add a custom domain `ai.shippie.app`. Cloudflare auto-provisions the cert.

---

## Step 6 — Google Cloud Console (manual)

1. Visit https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID → Web Application:
   - Authorized JavaScript origins: `https://shippie.app`
   - Authorized redirect URIs:
     - `https://shippie.app/api/auth/callback/google` (NextAuth Google provider)
     - `https://shippie.app/oauth/google-drive` (the user-Drive backup coordinator)
3. Enable the Google Drive API for the project.
4. Drop client ID + secret into Step 4's env vars.

---

## Step 7 — First smoke

```bash
# From your laptop, after DNS propagation (~30s):
curl -sI https://recipe.shippie.app/  # should return 200 (or 404 if no recipe app deployed yet — that's fine, just confirms wildcard routing works)
curl -sI https://ai.shippie.app/      # should return 200 (the dashboard)
```

Visit `https://shippie.app/dashboard` in your browser. Sign in. Deploy a showcase via the dashboard. Visit its slug subdomain. Open the Enhancements tab.

---

## Rollback

```bash
# Worker:
cd services/worker
bunx wrangler deployments list
bunx wrangler rollback <deployment-id>

# Pages:
# Cloudflare dashboard → Pages → project → Deployments → "Promote previous"
```

---

## Known operational caveats (per prior session memory)

- **CF R2 multipart not smoke-tested at >5 MiB.** First production zip upload that exceeds 5 MiB validates the multipart path. If it fails, log + fall back to non-multipart for the v1.
- **TURN fallback (Cloudflare Calls) not real-network-tested.** Local-network mesh works; cross-NAT mesh needs TURN credentials.
- **DurableObject SignalRoom not exercised under miniflare end-to-end.** Live DO routing only validated via signal-dev shim. First multi-device proximity session is the smoke.
- **Pre-existing test failures** (7 in apps/web/lib/deploy/) are unrelated to this work; do not let them block your deploy decision.

---

## What I (Claude) cannot do for you

- Set wrangler secrets — needs the actual secret values from your password manager
- Cloudflare dashboard clicks (DNS, Pages env vars, custom domain attachment)
- Google Cloud Console clicks (OAuth client creation, scope authorization)
- Sign in to NextAuth via the email magic link — the link arrives in your inbox

Everything else above is `bunx wrangler ...` commands you can run. If you want me to run any specific subset and stop before the destructive bits, say which.
