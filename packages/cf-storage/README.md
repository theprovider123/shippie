# @shippie/cf-storage

Production Cloudflare adapters for Shippie's deploy pipeline.

- `CfKv` — Workers KV via the REST API
- `CfR2` — R2 via the S3-compatible API (single-PUT ≤ 5 MiB, multipart above)

Both implement the same `KvStore` / `R2Store` interfaces as
`@shippie/dev-storage`, so the control plane swaps adapters based on
environment without touching call sites.

## B2 — one-time Cloudflare setup

### 1. Create the KV namespace

From `services/worker/`:

```bash
wrangler kv:namespace create APP_CONFIG
```

The CLI prints an `id = "..."`. Record it — you'll need it for the
`CF_KV_NAMESPACE_ID` env var and for uncommenting the
`[[kv_namespaces]]` block in `services/worker/wrangler.toml`.

### 2. Create the R2 buckets

```bash
wrangler r2 bucket create shippie-apps
wrangler r2 bucket create shippie-public
```

Then uncomment the `[[r2_buckets]]` blocks in
`services/worker/wrangler.toml`.

### 3. Create an R2 API token

Dashboard → R2 → "Manage R2 API Tokens" → Create. Scope:
`Object Read & Write` for both buckets. Record:

- `Access Key ID` → `CF_R2_ACCESS_KEY_ID`
- `Secret Access Key` → `CF_R2_SECRET_ACCESS_KEY`

### 4. Create a Workers API token for KV

Dashboard → My Profile → API Tokens → Create. Permissions:
`Account → Workers KV Storage → Edit` scoped to your account.
Record the token as `CF_API_TOKEN`.

### 5. Find your Account ID

Dashboard → right sidebar → "Account ID". Record as `CF_ACCOUNT_ID`.

## Environment variables

Set these on the control-plane host (Vercel env or local `.env.local`):

| Var | Purpose |
|---|---|
| `SHIPPIE_ENV` | Set to `production` to route storage through Cloudflare. |
| `CF_ACCOUNT_ID` | Cloudflare account ID. Required in prod. |
| `CF_API_TOKEN` | Workers KV Edit token. Required in prod. |
| `CF_KV_NAMESPACE_ID` | APP_CONFIG namespace id from `wrangler kv:namespace create`. |
| `CF_R2_ACCESS_KEY_ID` | R2 S3 access key. |
| `CF_R2_SECRET_ACCESS_KEY` | R2 S3 secret. |
| `CF_R2_BUCKET_APPS` | Name of the apps bucket (e.g. `shippie-apps`). |
| `CF_R2_BUCKET_PUBLIC` | Name of the public bucket (e.g. `shippie-public`). |
| `SHIPPIE_PUBLIC_HOST` | Public apex (e.g. `shippie.app`) for generated live URLs. |

In dev none of these are required — the control plane falls back to
`DevKv` / `DevR2` under `.shippie-dev-state/`.

## Limits and notes

- KV values are text; JSON helpers serialize before writing.
- R2 multipart threshold is 5 MiB (single PUT otherwise). Parts are 8 MiB.
- `list()` on both adapters transparently pages through cursors.
- 5xx / network errors on KV get a single retry; 4xx errors surface the API body.
- R2 failures during multipart trigger a best-effort `AbortMultipartUpload`.
