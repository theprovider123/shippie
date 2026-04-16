# Self-Hosting Shippie

Shippie is AGPL-licensed. You can run your own instance.

## Quick start

```bash
git clone https://github.com/shippie/shippie.git
cd shippie
docker compose up
```

This starts:
- **Postgres 16** on port 5432
- **Web platform** on port 3000
- **Worker** on port 4200
- **Cron runner** (internal scheduled jobs)

## First-run setup

```bash
# Apply database migrations
docker compose run web bun run db:push
```

## Environment variables

### Web (apps/web)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `NEXTAUTH_URL` | Yes | Public URL of the platform |
| `NEXTAUTH_SECRET` | Yes | Random secret for session encryption |
| `WORKER_PLATFORM_SECRET` | Yes | Shared HMAC secret (must match worker) |
| `FUNCTIONS_MASTER_KEY` | No | Base64 32-byte key for function secrets encryption |
| `TRIAL_IP_SALT` | Yes (for trials) | Random per-instance salt for hashing trial-deploy IPs |
| `SHIPPIE_INTERNAL_CRON_TOKEN` | Yes (for cron) | Bearer token guarding `/api/internal/*` endpoints |

### Worker (services/worker)

| Variable | Required | Description |
|---|---|---|
| `PLATFORM_API_URL` | Yes | URL of the web platform (e.g., `http://web:3000`) |
| `WORKER_PLATFORM_SECRET` | Yes | Shared HMAC secret (must match web) |

### Cron runner

| Variable | Required | Description |
|---|---|---|
| `PLATFORM_API_URL` | Yes | Internal URL of the web service |
| `SHIPPIE_INTERNAL_CRON_TOKEN` | Yes | Must match the web value |

## Scheduled jobs

The bundled cron container hits these endpoints on schedule:

| Job | Endpoint | Frequency | Purpose |
|---|---|---|---|
| `reap-trials` | `POST /api/internal/reap-trials` | hourly | Archive trial apps past their 24h TTL |

Replace the cron container with your scheduler of choice (GitHub Actions, a managed cron, Cloudflare Triggers) — the endpoints are stateless HTTP calls authenticated by the bearer token.

## Production considerations

- Use a managed Postgres (Neon, Supabase, RDS)
- Put the worker behind Cloudflare for SSL + caching
- Replace every `change-me-*` env with real secrets
- Configure a domain and update `NEXTAUTH_URL`
- For `TRIAL_IP_SALT` and `SHIPPIE_INTERNAL_CRON_TOKEN`, use `openssl rand -hex 32`
