# URL-wrap Deploy Mode — Design Spec

**Date:** 2026-04-23
**Status:** Approved — ready for implementation plan
**Ships in:** Phase A (first)

> Sibling spec: `2026-04-23-private-apps-and-invites-design.md`. The two are
> tightly coupled for the mevrouw end state but ship as independent phases,
> each producing working software on its own. This spec covers Phase A only.

## 1. Goal

Let a maker whose app is already hosted elsewhere (Vercel, Netlify, Render, Fly, their own VPS) list it on Shippie as a first-class marketplace app — with a PWA shell, install funnel, ratings, and a `*.shippie.app` runtime URL — **without Shippie having to host or build their code**. The Shippie Worker acts as a reverse proxy in front of the upstream origin, injecting the PWA manifest + SDK and capturing marketplace events.

**Non-goal:** running SSR Node code on Shippie. We never execute the maker's server — the maker keeps doing that where they already do it.

## 2. The proxy-vs-redirect decision

The Worker at `mevrouw.shippie.app` **proxies** requests to the upstream (fetches from Vercel, streams back). We explicitly rejected 302-redirect as the MVP because:

- With redirect, the installed PWA's `start_url` is `shippie.app` which then bounces the browser away — jarring UX on iOS, breaks Android's tab-reuse heuristics.
- With redirect, the SDK can't inject (different origin). No ratings, no install attribution, no analytics — we'd lose the marketplace value prop for wrapped apps.
- With redirect, the maker's app has two publicly-visible URLs (Shippie + upstream), confusing users.
- Cloudflare Workers do this exact pattern natively and cheaply (HTMLRewriter, streaming fetch).

Proxy keeps the shippie.app origin as the real origin from the browser's perspective. All cookies, URLs, auth flows stay consistent. The maker's backend is still "on Vercel" — Shippie is the edge + marketplace + PWA shell.

## 3. Proxy behaviour — what the Worker does

For every request to `{slug}.shippie.app` where `apps.source_kind = 'wrapped_url'`:

1. Look up `upstream_url` + `upstream_config` from the DB (or from KV; see §6).
2. Reconstruct the upstream request:
   - URL = `upstream_url + request.pathname + request.search`
   - Method, headers, body pass through
   - Strip `Host`, replace with upstream's host
   - Rewrite `Origin`, `Referer` to upstream's origin if `csp_mode = 'lenient'` (default); leave untouched if `'strict'`
3. `fetch()` upstream with streaming enabled
4. **On HTML responses** (Content-Type: text/html), pipe through `HTMLRewriter`:
   - Insert `<link rel="manifest" href="/__shippie/manifest">` before `</head>`
   - Insert `<script src="/__shippie/sdk.js" async></script>` before `</head>`
   - Strip any upstream `<script>` that points at their own SW registration paths that conflict with `/__shippie/` (rare; logged as a warning)
5. **Rewrite `Set-Cookie`** headers: any cookie with `Domain=<upstream-host>` gets its domain attribute stripped so the browser scopes it to the exact request host (`mevrouw.shippie.app`). `__Host-` prefixed cookies pass through unchanged.
6. **Strip upstream CSP** and apply Shippie's CSP (same CSP the static path emits today). Makers who need stricter CSP set `csp_mode = 'strict'` in their wrap config — we then pass the upstream CSP through and accept that our SDK may be blocked.
7. Mint/echo `x-shippie-trace-id` as today.
8. Stream the body back without full buffering.

**Reserved routes** (`/__shippie/*`) short-circuit before proxying — the Worker owns manifest, icons, splash, SDK, service worker exactly as it does on static deploys.

## 4. Data model additions

```sql
alter table apps add column source_kind text not null default 'static';
-- 'static' | 'wrapped_url'

alter table apps add column upstream_url text;
-- only set when source_kind='wrapped_url'; must be https, must have a path of /

alter table apps add column upstream_config jsonb not null default '{}'::jsonb;
-- { csp_mode: 'lenient'|'strict', auth_redirect_hint: string, extra_headers: {} }
```

`deploys` gets nothing new — wrapped apps still have a "deploy" record (pointing at the wrap config rather than an R2 path). This keeps `active_deploy_id` semantics consistent: rollback of a wrapped app means "flip back to the previous upstream URL."

## 5. API surface

### `POST /api/deploy/wrap`

**Auth:** required (signed-in or CLI token).

**Body:**
```json
{
  "slug": "mevrouw",
  "upstream_url": "https://mevrouw.vercel.app",
  "name": "mevrouw",
  "tagline": "A private PWA for two.",
  "type": "app",
  "category": "personal",
  "csp_mode": "lenient",
  "theme_color": "#E8603C"
}
```

**Response:**
```json
{
  "success": true,
  "slug": "mevrouw",
  "deploy_id": "...",
  "live_url": "https://mevrouw.shippie.app/",
  "runtime_config": {
    "required_redirect_uris": [
      "https://mevrouw.shippie.app/api/auth/callback"
    ],
    "supabase_config_note": "Add the URI above to Authentication → URL Configuration → Redirect URLs"
  }
}
```

### CLI

```
shippie wrap <upstream-url> [--slug X] [--private] [--strict-csp]
```

Thin wrapper over the HTTP endpoint. `--private` sets `visibility_scope='private'` and creates an initial link-invite (Phase B; a no-op today beyond flagging the row).

### Dashboard

`/new` gets a new tab: **Wrap a URL**. Fields for upstream URL, slug, name, tagline, category, type. On submit, calls `/api/deploy/wrap`, shows the Supabase redirect-URI hint and the live URL.

## 6. Runtime resolution

The Worker resolves slugs today via Host header → KV lookup. We extend KV shape:

```
app:{slug}  →  {
  active_deploy_id: "...",
  source_kind: "static" | "wrapped_url",
  upstream_url: "https://...",   // only when wrapped
  upstream_config: { ... },      // only when wrapped
  visibility_scope: "public" | "unlisted" | "private"
}
```

KV is written by the deploy hot path (same function that writes static KV meta). 5-minute TTL invalidation via signed-request spine when config changes.

For static apps, nothing changes. For wrapped apps, the file router detects `source_kind='wrapped_url'` and routes to `proxyToUpstream()` instead of `serveFromR2()`.

## 7. Ratings + install funnel

The SDK is injected into every HTML response, same as static deploys. Events fire identically:

- `install_prompt_shown`
- `install_prompt_accepted`
- `first_session_opened`
- `rating_submitted`

All events land in `/api/ingest` via the same trace-id-tagged pipeline. The ingest endpoint doesn't care whether the app is wrapped or static — `usageDaily` rollups, trending queries, and the maker dashboard all work unchanged.

## 8. Auth provider redirect URIs — the maker's one responsibility

Supabase, Auth0, Clerk, and friends all require the maker to allowlist each public origin. When a maker wraps an app, the redirect URI for their auth provider changes from `https://mevrouw.vercel.app/api/auth/callback` to `https://mevrouw.shippie.app/api/auth/callback`.

**MVP handling:** the wrap response includes a `runtime_config.required_redirect_uris` array and the dashboard shows a copy-pasteable snippet. Auto-configuration via the provider's Management API is out of scope for Phase A — documented as a post-MVP follow-up.

## 9. Service worker coexistence

Makers often ship their own SW (Serwist, Workbox). Shippie's SDK also wants to register one.

**Resolution:** Shippie's SW lives at `/__shippie/sw.js` with scope `/__shippie/*`. The maker's SW stays at `/sw.js` with scope `/`. Browsers happily run two SWs on one origin as long as their scopes don't overlap.

The SDK wrapper's SW registration code explicitly pins its scope — this is already the case in the existing `@shippie/sdk/wrapper` package and needs no changes.

## 10. Edge cases + trade-offs

| Concern | Handling |
|---|---|
| WebSockets from upstream | Workers support WS upgrade; pass through. |
| SSE streams | Pass through; no buffering in the rewriter for `text/event-stream`. |
| File uploads > 100 MB | Streaming-mode fetch handles up to CF's per-request limit; documented. |
| Upstream 5xx | Pass through with original status. Show a lightweight error shell only on 404 (which might be our own routing bug). |
| CORS from upstream | If upstream emits `Access-Control-Allow-Origin: *`, pass through. If origin-specific, rewrite to request origin. |
| Cookie domain on upstream | Strip `Domain` attr on `Set-Cookie`; browser scopes to request host. |
| `__Host-` / `__Secure-` cookies | Pass through unchanged; both prefixes are safe. |
| HEAD, OPTIONS | Pass through. |
| Rate limiting | Per-slug rate limit on the Worker to prevent an upstream DoS via Shippie. |

## 11. Cost

Wrap mode trades R2 reads (~free) for:
- One Worker invocation per request (was already happening)
- One outbound `fetch` to upstream (billable egress out of CF)
- HTMLRewriter CPU on HTML responses (~negligible)

For the trial bucket we cap wrap deploys at 2 per IP per hour. For signed-in makers there's no cap in Phase A. Cost pricing is a Phase-D decision.

## 12. What ships in Phase A

- Schema additions (`source_kind`, `upstream_url`, `upstream_config`)
- Worker proxy handler with HTMLRewriter SDK injection
- Cookie + CSP rewriting
- `POST /api/deploy/wrap` endpoint
- CLI `shippie wrap` command
- Dashboard "Wrap a URL" form on `/new`
- Copy-pasteable redirect-URI hint in the wrap response
- Integration test: wrap `http://localhost:4100/` (a static site), prove the proxy serves it through `trial-wrap-xxx.localhost:4200` with SDK injected

No private-visibility logic. All wrapped apps in Phase A are `visibility_scope = 'public'` by default.

## 13. Explicit non-scope (for later phases)

- **Phase B** (sibling spec): private visibility, link-invite creation + claim flow, access gate middleware.
- **Phase C** (sibling spec): email invites, Supabase Management API integration, usage-based billing.
- Any change to the static deploy path. This spec is purely additive — `source_kind='static'` keeps behaving exactly as today.

## 14. Risks

1. **Upstream change detection.** If the maker's Vercel deploy changes, Shippie has no build hook to invalidate cached metadata. Accepted: we don't cache upstream responses in Phase A; every request is a fresh `fetch`. Optional Cache API layer is Phase D.
2. **Auth cookie edge cases.** Third-party cookie restrictions on Safari could bite for certain flows. Mitigation: proxy makes the cookie same-origin to the request host, so third-party rules don't apply. Needs e2e testing against mevrouw-style Supabase flows.
3. **SW double-registration race.** If the maker's SW aggressively claims control over `/__shippie/*`, our SW can't register. Mitigation: the SDK logs a loud error + falls back to non-SW install funnel. Documented in the wrap docs.
4. **Abuse.** Someone wraps `https://competitor.example.com` and publishes a ratings page for it. Mitigation: slug uniqueness (only one `competitor` slug), reserved-slugs list, and DMCA-style takedown via `is_archived`. Trust & safety tooling is Phase C.

## 15. Success criteria

- A maker can wrap an arbitrary hosted PWA (mevrouw, a portfolio site, a Vercel app) and get a working `*.shippie.app` URL within 60s, with zero changes to the upstream app code.
- Rating + install events fire from the wrapped app and appear in the maker dashboard.
- A mobile user can install the wrapped app from `*.shippie.app` and use it offline (if the upstream supports offline).
- The page load time budget from edge to first byte is ≤ 300 ms on top of the upstream's own TTFB.
