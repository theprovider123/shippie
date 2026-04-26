# Cloudflare + Google OAuth Deploy Playbook

> Single-page playbook to take Shippie from green-on-localhost to a live `shippie.app` with backups working. Estimated time: 60-90 minutes.

This playbook is intentionally tighter than [`docs/superpowers/plans/2026-04-26-prod-deploy-runbook.md`](../superpowers/plans/2026-04-26-prod-deploy-runbook.md) — it tells you exactly what to type, in order, with the secrets generated as you go. The full runbook stays as the long-form reference.

---

## 0 — Bootstrap

```bash
# Verify wrangler is logged into the right account.
bunx wrangler whoami
# Expect: 582bea37051924b1cfeaec7b1cc42603 (devanteprov@gmail.com)

# Verify the local build is green.
cd /Users/devante/Documents/Shippie
bun run health   # expect 26/26 typecheck, 31/31 test, 24/24 build
```

If `bun run health` fails, fix that before continuing — the deploy will inherit the same broken state.

---

## 1 — Create Cloudflare resources (one-time)

```bash
cd apps/platform

# D1 database — note the database_id it returns and update wrangler.toml
bunx wrangler d1 create shippie-platform-d1

# R2 buckets
bunx wrangler r2 bucket create shippie-apps-prod
bunx wrangler r2 bucket create shippie-assets

# KV namespace — note the id and update wrangler.toml
bunx wrangler kv namespace create CACHE
```

Update `apps/platform/wrangler.toml` with the IDs returned. Repeat with `--env preview` if you want a separate preview environment.

```bash
# Apply D1 schema migrations to production (this includes the new
# 0004_proof_events.sql for the proof-event table + capability_badges).
bunx wrangler d1 migrations apply shippie-platform-d1 --remote
```

---

## 2 — Generate secrets

Generate once. Save in your password manager. **Do not commit.**

```bash
echo "AUTH_SECRET=$(openssl rand -hex 32)"
echo "OAUTH_COORDINATOR_SECRET=$(openssl rand -hex 32)"
echo "SHIPPIE_INTERNAL_CRON_TOKEN=$(openssl rand -hex 32)"
echo "INVITE_SECRET=$(openssl rand -hex 32)"
echo "WORKER_PLATFORM_SECRET=$(openssl rand -hex 32)"
```

---

## 3 — GitHub OAuth (for maker sign-in)

1. https://github.com/settings/developers → New OAuth App.
2. Application name: `Shippie`.
3. Homepage URL: `https://shippie.app`.
4. Authorization callback URL: `https://shippie.app/auth/callback/github`.
5. Save. Copy the Client ID. Generate a Client Secret. Save both.

---

## 4 — Google Cloud Console (for backup-to-Drive)

1. https://console.cloud.google.com/apis/credentials → Create Credentials → OAuth 2.0 Client ID.
2. Application type: Web application.
3. Name: `Shippie Coordinator`.
4. Authorized JavaScript origins: `https://shippie.app`.
5. Authorized redirect URIs: `https://shippie.app/oauth/google-drive` — exactly one.
6. Save. Copy Client ID + Client Secret.
7. APIs & Services → Library → enable **Google Drive API**.

The OAuth consent screen needs the `https://www.googleapis.com/auth/drive.file` scope. The first time you test, add yourself as a test user under the app's "Test users" section so Google doesn't require app verification yet.

---

## 5 — Deploy the platform

```bash
cd apps/platform
bun install   # ensure deps are linked

# First time only — create the Pages project.
bunx wrangler pages project create shippie-platform --production-branch main

# Build (this also wraps the worker with scheduled() + SignalRoom export).
bun run build

# Deploy. The build output is in .svelte-kit/cloudflare/.
bunx wrangler pages deploy .svelte-kit/cloudflare --project-name shippie-platform
```

Set environment variables in the Pages project (Cloudflare dashboard → Pages → shippie-platform → Settings → Environment variables → Production):

| Variable | Type | Value |
|---|---|---|
| `AUTH_SECRET` | secret | from step 2 |
| `OAUTH_COORDINATOR_SECRET` | secret | from step 2 |
| `SHIPPIE_INTERNAL_CRON_TOKEN` | secret | from step 2 |
| `INVITE_SECRET` | secret | from step 2 |
| `WORKER_PLATFORM_SECRET` | secret | from step 2 |
| `AUTH_GITHUB_ID` | secret | from step 3 |
| `AUTH_GITHUB_SECRET` | secret | from step 3 |
| `GOOGLE_DRIVE_CLIENT_ID` | secret | from step 4 |
| `GOOGLE_DRIVE_CLIENT_SECRET` | secret | from step 4 |
| `SHIPPIE_ENV` | plaintext | `production` |
| `SHIPPIE_PUBLIC_HOST` | plaintext | `shippie.app` |
| `PUBLIC_ORIGIN` | plaintext | `https://shippie.app` |

After setting env vars, redeploy so the Pages function picks them up:

```bash
bunx wrangler pages deploy .svelte-kit/cloudflare --project-name shippie-platform
```

---

## 6 — Deploy the AI iframe

```bash
cd apps/shippie-ai
bun run build

# First time only.
bunx wrangler pages project create shippie-ai --production-branch main

bunx wrangler pages deploy dist --project-name shippie-ai
```

In the Pages project, add a custom domain `ai.shippie.app`. Cloudflare auto-provisions the cert.

---

## 7 — DNS (Cloudflare zone)

In the `shippie.app` zone:

| Type | Name | Target | Notes |
|---|---|---|---|
| CNAME | @ | `shippie-platform.pages.dev` | Apex |
| CNAME | * | `shippie-platform.pages.dev` | Every maker subdomain |
| CNAME | cdn | `shippie-platform.pages.dev` | Hosted SDK |
| CNAME | proximity | `shippie-platform.pages.dev` | WebSocket signal |
| CNAME | ai | `shippie-ai.pages.dev` | AI iframe |

Add `shippie.app`, `*.shippie.app`, `cdn.shippie.app`, `proximity.shippie.app` as custom domains in the `shippie-platform` Pages project. Add `ai.shippie.app` to the `shippie-ai` project.

---

## 8 — Smoke

```bash
# After DNS propagation (~30s):
curl -sI https://shippie.app/                  # 200
curl -sI https://recipe.shippie.app/           # 200 or 404 — confirms wildcard routing
curl -sI https://ai.shippie.app/               # 200
```

Visit `https://shippie.app/dashboard` in your browser → sign in with GitHub → deploy a showcase via `/new` → visit its slug subdomain → open the Enhancements tab.

---

## 9 — Verify proof + backup E2E

```bash
# After your first deploy + a real-device install, the proof event spine
# should start collecting events. Force-run the daily badge rollup:
bunx wrangler d1 execute shippie-platform-d1 --remote --command "SELECT count(*) FROM proof_events;"
# Expect at least the install + service_worker_active events from your phone.
```

Trigger the daily 4am cron manually (Cloudflare dashboard → Workers → shippie-platform → Triggers → Cron Triggers → "Run for me") to see capability_badges populated even before the first 4am UTC.

For the Drive backup E2E, follow [`real-phone-checklist.md → Showcase 3 → Encrypted backup`](./real-phone-checklist.md).

---

## 10 — Rollback

```bash
# Pages (platform or AI iframe):
bunx wrangler pages deployment list --project-name shippie-platform
bunx wrangler pages deployment activate <deployment-id> --project-name shippie-platform
```

Or via dashboard: Pages → project → Deployments → "Promote previous".

---

## What I (Claude) cannot do for you

- Set wrangler secrets — I'd need the actual values which live in your password manager.
- Cloudflare dashboard clicks (DNS, Pages env vars, custom domain attachment).
- Google Cloud Console clicks (OAuth client creation, Drive API enable, scope authorization).
- Sign in via GitHub — the OAuth handshake happens in your browser.

Everything else above is `bunx wrangler ...` + `openssl rand -hex 32`. You can run the bash blocks step by step, paste the resulting IDs into the right places, and reach a working `https://shippie.app` in under an hour.
