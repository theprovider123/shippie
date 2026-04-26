# Route Inventory — apps/web → apps/platform

Generated 2026-04-25. Used by Phase 1+ of the SvelteKit refactor to scope the route port. Status column drives priority and effort.

**Status legend:**
- `port-1to1` — direct rewrite to SvelteKit equivalent. Same contract, same auth, same response shape. Bulk of the work.
- `simplify` — port but with simpler logic now that platform↔worker boundary is gone.
- `merge` — combine with worker-side route (currently in `services/worker/src/router/`) into one SvelteKit handler.
- `deprecate` — drop. No longer needed in v2 (or replaced by a different mechanism).

**Effort (T-shirt):**
- `S` ≤ 2h. Pure CRUD, no state machinery.
- `M` 0.5–1d. Some logic; e.g., trust checks, rate limiting, response shape.
- `L` 1–3d. Complex (deploy pipeline, OAuth flow, full UI page port).

**73 endpoints total: 49 API routes + 24 pages.**

---

## Pages (24)

| Path | Status | Effort | Notes |
|---|---|---|---|
| `app/page.tsx` | port-1to1 | M | Homepage. Hero, install pitch, links. |
| `app/why/page.tsx` | port-1to1 | S | Manifesto-style page. |
| `app/docs/page.tsx` | port-1to1 | M | Docs landing. Convert to SvelteKit `+page.svelte`; consider mdsvex for MDX. |
| `app/examples/page.tsx` | port-1to1 | S | Static showcase grid. |
| `app/leaderboards/page.tsx` | port-1to1 | M | Real leaderboard data; depends on D1 having `usage_daily` rows. |
| `app/stats/page.tsx` | simplify | S | Public stats page. |
| `app/apps/page.tsx` | port-1to1 | M | Marketplace browse + search. Uses FTS5 in D1. |
| `app/apps/[slug]/page.tsx` | port-1to1 | L | App detail page with all the honesty-pass cuts. Most-touched UI in the repo. |
| `app/new/page.tsx` | port-1to1 | M | 3-card picker (zip / wrap / GitHub). |
| `app/deploy/page.tsx` | deprecate | — | Bare `/deploy` already redirects to `/new`. Remove the route entirely. |
| `app/auth/signin/page.tsx` | port-1to1 | M | Lucia + Arctic providers; magic-link form. Replaces NextAuth UI. |
| `app/auth/error/page.tsx` | port-1to1 | S | Auth error display. |
| `app/auth/verify-request/page.tsx` | port-1to1 | S | "Check your email" page after magic-link request. |
| `app/auth/cli/activate/page.tsx` | port-1to1 | M | Device-flow activation page (CLI login). |
| `app/dashboard/page.tsx` | port-1to1 | M | Dashboard home. |
| `app/dashboard/apps/page.tsx` | port-1to1 | M | List of maker's apps. |
| `app/dashboard/apps/[slug]/access/page.tsx` | port-1to1 | M | Visibility + invite management. |
| `app/dashboard/apps/[slug]/analytics/page.tsx` | port-1to1 | M | Per-app analytics chart. |
| `app/dashboard/analytics/page.tsx` | port-1to1 | M | Cross-app analytics. |
| `app/dashboard/feedback/page.tsx` | port-1to1 | M | Feedback inbox (comments, feature requests, bugs). |
| `app/admin/page.tsx` | port-1to1 | M | Admin dashboard, role-gated. |
| `app/admin/audit/page.tsx` | port-1to1 | M | Audit log viewer. |
| `app/invite/[token]/page.tsx` | port-1to1 | M | Invite claim page (sets HMAC cookie). |
| `app/orgs/invite/[token]/page.tsx` | deprecate | — | Org-invite page; orgs feature is non-MVP. Remove unless we need it. |

**Pages effort total: ~16-22 dev-days.**

---

## API routes (49)

### Auth (7)

| Path | Status | Effort | Notes |
|---|---|---|---|
| `api/auth/[...nextauth]/route.ts` | deprecate | — | Replaced by Lucia routes; delete. |
| `api/auth/dev-signin/route.ts` | port-1to1 | S | Dev-only "skip the magic link" endpoint. Lucia equivalent. |
| `api/auth/cli/device/route.ts` | port-1to1 | M | CLI device-flow start. |
| `api/auth/cli/poll/route.ts` | port-1to1 | M | CLI device-flow poll. |
| `api/auth/cli/approve/route.ts` | port-1to1 | M | CLI device-flow approve (called from activate page). |
| `api/auth/cli/whoami/route.ts` | port-1to1 | S | Token → user lookup. |
| (new) `routes/auth/login/+page.server.ts` | new | S | OAuth init endpoint (GitHub/Google). |
| (new) `routes/auth/callback/[provider]/+server.ts` | new | M | OAuth callback. |
| (new) `routes/auth/logout/+server.ts` | new | S | Session destruction. |
| (new) `routes/auth/email-link/[token]/+server.ts` | new | M | Magic-link redemption. |

### Deploy (10)

| Path | Status | Effort | Notes |
|---|---|---|---|
| `api/deploy/route.ts` | port-1to1 | L | Zip upload entry point. Heart of the platform. |
| `api/deploy/wrap/route.ts` | port-1to1 | L | URL-wrap deploy. |
| `api/deploy/path/route.ts` | port-1to1 | M | Local-path deploy from CLI. |
| `api/deploy/trial/route.ts` | port-1to1 | M | Anonymous trial deploy. |
| `api/deploy/github/route.ts` | port-1to1 | L | GitHub-repo deploy. Triggers GH Actions. |
| `api/deploy/[id]/status/route.ts` | port-1to1 | M | Deploy status polling. |
| `api/deploy/rollback/route.ts` | port-1to1 | M | Roll back to a previous deploy version. |
| `api/deploy/badge/[slug]/route.ts` | port-1to1 | S | "Live on Shippie" SVG badge. |
| `api/deploy/functions/route.ts` | deprecate | — | Functions feature is post-MVP per simplification plan. Drop until it's a real product. |
| `api/deploy/functions/secrets/route.ts` | deprecate | — | Same. |

### Apps + invites (5)

| Path | Status | Effort | Notes |
|---|---|---|---|
| `api/apps/[slug]/visibility/route.ts` | port-1to1 | S | PATCH visibility (public/unlisted/private). |
| `api/apps/[slug]/rate/route.ts` | port-1to1 | M | Submit rating. (Has the pre-existing mock-pollution test issue — fix during port.) |
| `api/apps/[slug]/invites/route.ts` | port-1to1 | M | Invite CRUD (GET list, POST create). |
| `api/apps/[slug]/invites/[id]/route.ts` | port-1to1 | S | Invite revoke. |
| `api/invite/[token]/claim/route.ts` | port-1to1 | M | Claim invite, sets HMAC cookie. |

### GitHub (4)

| Path | Status | Effort | Notes |
|---|---|---|---|
| `api/github/install/route.ts` | port-1to1 | S | Redirect to GitHub App install. |
| `api/github/install/callback/route.ts` | port-1to1 | M | Receive installation_id, link to user. |
| `api/github/repos/route.ts` | port-1to1 | M | List installed repos for picker UI. |
| `api/github/webhook/route.ts` | port-1to1 | L | Webhook receiver. Verify signature, route to handler. |

### Internal cron + worker callbacks (10)

| Path | Status | Effort | Notes |
|---|---|---|---|
| `api/internal/handoff/route.ts` | merge | M | Worker calls this after signing; merges into `scheduled` or direct platform handler. |
| `api/internal/ingest-events/route.ts` | merge | M | Same — events posted from worker side; merge or call-locally now that worker is in same Worker. |
| `api/internal/push/subscribe/route.ts` | merge | S | Web Push subscribe; merge with worker-side push logic. |
| `api/internal/push/unsubscribe/route.ts` | merge | S | Same. |
| `api/internal/reap-trials/route.ts` | port-cron | S | Move to `scheduled` handler (`0 * * * *`). |
| `api/internal/reconcile-kv/route.ts` | port-cron | M | Move to `scheduled` (`*/5 * * * *`). KV writes use bindings now. |
| `api/internal/retention/route.ts` | port-cron | M | Move to `scheduled` (`0 4 * * *`). Replace partition drop with `DELETE` (D1 has no partitions). |
| `api/internal/rollups/route.ts` | port-cron | M | Move to `scheduled` (`0 * * * *`). |
| `api/internal/sdk/analytics/route.ts` | merge | M | Beacon endpoint — wraps worker-side ingestion now that they merge. |
| `api/internal/sdk/feedback/route.ts` | merge | M | Same. |
| `api/internal/sdk/feedback/vote/route.ts` | merge | S | Same. |

### Org/admin/misc (8)

| Path | Status | Effort | Notes |
|---|---|---|---|
| `api/admin/apps/[id]/route.ts` | port-1to1 | M | Admin app CRUD. |
| `api/orgs/route.ts` | deprecate | — | Orgs are non-MVP per simplification plan. |
| `api/orgs/[slug]/invites/route.ts` | deprecate | — | Same. |
| `api/orgs/[slug]/members/route.ts` | deprecate | — | Same. |
| `api/orgs/invite/[token]/accept/route.ts` | deprecate | — | Same. |
| `api/domains/route.ts` | port-1to1 | M | Custom-domain registration. (Verification still TODO; port behavior, finish later.) |
| `api/domains/verify/route.ts` | port-1to1 | M | Same. Plus the cert-provisioning + worker KV write the prior code TODO'd. |
| `api/assets/[appId]/[kind]/route.ts` | port-1to1 | S | Public asset serving (icons, OG images). May simplify if R2 binding makes the proxy redundant. |

### Other (5)

| Path | Status | Effort | Notes |
|---|---|---|---|
| `api/shippie/install/route.ts` | port-1to1 | S | "Install Shippie SDK" beacon. |
| `api/shippie/install-click/route.ts` | port-1to1 | S | Click-tracking. |
| `api/i/[code]/route.ts` | port-1to1 | S | Short-invite redirect. |
| `oauth/google-drive/route.ts` | port-1to1 | M | OAuth coordinator (already built this morning). |
| `health/route.ts` | port-1to1 | S | Healthcheck. |

---

## Summary

- **Total endpoints to port:** 49 API + 24 pages = **73**.
- **Deprecated (drop entirely):** 9 (orgs ×4, functions ×2, NextAuth, /deploy, orgs invite page).
- **Net to port:** **64.**

**Effort:**
- 11 × L = ~22 dev-days
- 35 × M = ~26 dev-days
- 18 × S = ~5 dev-days
- **Total port effort: ~53 dev-days = ~10–11 dev-weeks** for a single engineer dedicated to nothing else.

This validates the 8-week plan IS aggressive — it assumes parallel package work continues during the same hours and that integration testing fits within the per-phase windows. A 10-week plan is more realistic if any of the four following slip:
- D1 query patterns require non-trivial rewrites (joins that Drizzle generates differently)
- OAuth provider configurations have surprises (GitHub App scopes, redirect URI propagation)
- Real-data migration uncovers row-level corruption or schema-mismatch issues
- DO migration loses unexpected state across the worker-name change

---

## Port-order recommendation (matches Phase 4–7 in the main plan)

1. **Read-only public pages** (week 4): home, why, docs, leaderboards, apps grid, app detail, invite claim.
2. **Auth + sessions** (week 3, blocks below): NextAuth → Lucia + Arctic + magic-link.
3. **Deploy paths** (week 5): zip → wrap → trial → path → github → status → rollback → badge.
4. **Dashboard** (week 5): apps list, app overview, access, analytics, feedback inbox.
5. **Admin + audit** (week 7): admin pages last; lower-traffic, role-gated.
6. **Internal/cron/webhooks** (week 7): scheduled handlers + GH webhook + worker-callback merges.
7. **Drop deprecated** (week 7): delete the 9 endpoints flagged above.
