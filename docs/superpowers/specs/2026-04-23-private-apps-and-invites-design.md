# Private Apps & Invites — Design Spec

**Date:** 2026-04-23
**Status:** Approved — ready for implementation plan
**Ships in:** Phase B (link invites) + Phase C (email invites)

> Sibling spec: `2026-04-23-url-wrap-mode-design.md`. Together they unlock
> the mevrouw end state: wrap the Vercel-hosted PWA privately and share
> access only with specific people via invite link.

## 1. Goal

Let a maker publish an app to Shippie that is invisible to the public and only accessible to people who hold a valid invite — while keeping the entire marketplace / install funnel / ratings / dashboard experience otherwise identical.

Two motivating use cases:
1. **Couple / family / small-team apps** like mevrouw — private by nature, 2–10 people, no discovery needed.
2. **Early-access testing** — a maker soft-launches to a cohort before going public.

**Non-goal:** defending against motivated attackers with access to browser dev tools. Private apps are "hidden, not secret." The actual secrets (data, auth) live in the app's backend (Supabase RLS, in mevrouw's case). Shippie's access gate is a hiding layer.

## 2. Visibility model

`apps.visibility_scope` today is `'public'` or `'unlisted'`. We add a third value: `'private'`.

| Scope | Appears on `/apps`? | Appears on `/leaderboards`? | `/apps/{slug}` returns? | Runtime `{slug}.shippie.app` serves? |
|---|---|---|---|---|
| `public` | ✅ | ✅ | 200 OK | 200 OK |
| `unlisted` | ❌ | ❌ | 200 OK (with URL) | 200 OK |
| `private` | ❌ | ❌ | 404 unless access | 401 page unless access |

"Unless access" means the viewer has one of:
- An `app_access` row tying their `user_id` or email to this app, OR
- A signed invite cookie for this app slug (set by the invite claim flow).

## 3. Data model

```sql
-- New table: durable access grants
create table app_access (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,  -- null until claimer signs up
  email text,                                            -- used for pre-invite lookup
  invited_by uuid references users(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  source text not null,  -- 'owner' | 'invite_link' | 'invite_email'
  unique (app_id, user_id),
  unique (app_id, email)
);
create index app_access_app_idx on app_access (app_id) where revoked_at is null;

-- New table: invite tokens
create table app_invites (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  token text not null unique,           -- 12-char url-safe random
  kind text not null,                   -- 'link' | 'email'
  email text,                           -- null for link; required for email
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  max_uses integer,                     -- null = unlimited
  used_count integer not null default 0,
  revoked_at timestamptz
);
create index app_invites_app_idx on app_invites (app_id) where revoked_at is null;
```

## 4. Invite kinds

Both kinds share a schema but differ in claim rules.

### Link invite (`kind = 'link'`)

Anyone holding the URL can claim. Optional:
- `max_uses` — hard cap on distinct claims
- `expires_at` — token stops working after this timestamp

URL shape: `https://shippie.app/invite/{token}`

**Claim flow (link, not signed in):**
1. GET `/invite/{token}` → shows `App name · "Someone shared this with you" · [Accept]` page
2. Click Accept → POST `/api/invite/{token}/claim`
3. Server sets a `__Host-shippie_invite_{app_slug}` cookie containing a signed grant JWT:
   ```
   { app_id, granted_at, expires_at: +30d, anon: true }
   ```
4. Redirect to `{slug}.shippie.app/`

**Claim flow (link, signed in):**
1. Same GET page; click Accept
2. POST `/api/invite/{token}/claim` creates an `app_access` row keyed to `user_id`
3. Still sets the invite cookie (so the Worker doesn't need to re-query the DB on every request)
4. Redirect to `{slug}.shippie.app/`

### Email invite (`kind = 'email'`)

Only the recipient can claim. Requires Phase C (email delivery).

**Claim flow:**
1. Maker creates invite with `{app_id, email, expires_at?}`
2. Shippie sends email via nodemailer (same pipeline as magic-link auth) with the URL `https://shippie.app/invite/{token}`
3. Invitee opens; must sign in with a matching email (magic link flow)
4. Once signed in with matching email, `app_access` row created, invite cookie set
5. If the signed-in email doesn't match the invite's email, claim rejected with `403 email_mismatch`

## 5. Access check — where and how

Two places enforce access: the control plane (for the marketplace page + APIs) and the runtime Worker (for the actual app).

### Control plane (`apps/web`)

A shared helper `checkAccess(appId, viewer)` returns `'granted' | 'denied'`.

Inputs:
- `appId` → load `visibility_scope`
- `viewer` → `{ userId?, email?, inviteCookie? }` derived from the request

Logic:
```
if scope == 'public' or scope == 'unlisted': return 'granted'
if scope == 'private':
  if viewer.userId matches app_access row: return 'granted'
  if viewer.email matches app_access row: return 'granted'
  if viewer.inviteCookie verified + app_id matches + not expired: return 'granted'
  return 'denied'
```

Called from:
- `/apps/[slug]/page.tsx` — `'denied'` returns 404 (not 403 — no "this app exists" leak)
- Dashboard queries naturally filter by `maker_id` so they never touch private apps the viewer doesn't own
- Public listing queries (`/apps`, `/leaderboards/*`, RSS, sitemap) already filter `visibility_scope = 'public'`

### Runtime Worker (`services/worker`)

New middleware between slug resolution and file serving. For `visibility_scope='private'`:

1. Check `__Host-shippie_invite_{app_slug}` cookie; verify HMAC signature with a Worker env secret
2. If cookie valid and `app_id` matches: proceed
3. Otherwise check `shippie_session` cookie (our auth session), resolve user, query KV for the cached access list
4. If session user in access list: proceed
5. Otherwise: serve a minimal static `401 invite required` HTML page

The KV access list is keyed `access:{slug}` and stores `{user_ids: [...], emails: [...], version}`. It's refreshed on every invite grant/revoke via the existing signed-request spine. 5-min TTL for safety.

## 6. Invite cookie design

Cookie name: `__Host-shippie_invite_{slug}` — one cookie per wrapped-app slug so revocation + multi-app access work independently.

Value: signed compact JWT (HS256) with the Worker's HMAC secret:
```
{
  "sub": "anon-ab12cd",   // anonymous claim id, stable per browser
  "app": "mevrouw",
  "exp": <unix timestamp +30d>,
  "src": "invite_link",   // or 'invite_email'
  "tok": "<invite_id>"    // for revocation audit trail
}
```

- `__Host-` prefix forces `Path=/`, `Secure`, and blocks domain attribute — cookie is scoped to the exact origin (`shippie.app`) and cannot be set cross-slug by an attacker.
- Cookie **does** apply to `{slug}.shippie.app` because that subdomain is served by the same eTLD+1 with matching root-cookie propagation.
- Actually subtle: `__Host-` cookies at apex `shippie.app` do NOT propagate to subdomains. So we set **two cookies**: `__Host-shippie_invite_{slug}` on apex (for `/invite/` flow) and `__Secure-shippie_invite_{slug}` with `Domain=.shippie.app` (for subdomain runtime access). Both verified against the same secret.

## 7. Maker UX — dashboard access management

New page: `/dashboard/apps/{slug}/access`.

Sections:
1. **Visibility** — radio: Public · Unlisted · Private. Changing to Private warns: "Nobody will see this app unless they have an invite."
2. **Access list** — table of `app_access` rows: Name/email, Granted, Last seen (from events), Actions (Revoke).
3. **Active invites** — table of `app_invites` where `revoked_at is null` and (`expires_at is null` or future): Token (copy button), Kind, Uses left, Expires, Actions (Revoke, Copy URL).
4. **Create invite** — form with two tabs:
   - Link: optional max-uses, optional expiry. Generates token, shows copy-paste URL.
   - Email (Phase C): enter email, optional expiry. Sends invite email.

## 8. API surface

```
POST   /api/apps/{slug}/invites           { kind, email?, max_uses?, expires_at? }
GET    /api/apps/{slug}/invites           → list (maker-only)
DELETE /api/apps/{slug}/invites/{id}      → revoke (maker-only)

GET    /invite/{token}                    → accept-invite page (public)
POST   /api/invite/{token}/claim          → sets invite cookie, creates app_access
                                            if signed in

GET    /api/apps/{slug}/access            → list (maker-only)
DELETE /api/apps/{slug}/access/{id}       → revoke a granted access (maker-only)
```

All maker-only endpoints check `session.userId === app.maker_id`.

## 9. CLI

```
shippie invite <slug> [--email X] [--max-uses N] [--expires 30d]
→ Invite created.
  URL: https://shippie.app/invite/k8x2q4j9
  Expires: 2026-05-23
  Uses: unlimited

shippie invites <slug>
→ Active invites:
  - k8x2q4j9  link   unlimited  expires 2026-05-23
  - a3m9p2z7  email  alice@…    expires 2026-05-01

shippie invite revoke <slug> <token>
```

## 10. Worker changes — concretely

`services/worker/src/router/files.ts` (or a new `access-gate.ts` middleware):

```ts
app.use('/*', async (c, next) => {
  const meta = await loadAppMeta(c.var.slug, c.env);
  if (meta.visibility_scope !== 'private') return next();
  const access = await checkRuntimeAccess(c, meta);
  if (access === 'granted') return next();
  return c.html(renderInviteRequiredPage(meta), 401);
});
```

`checkRuntimeAccess` logic:
1. Parse `__Secure-shippie_invite_{slug}` cookie
2. Verify HMAC, check `exp`, check `app` matches
3. If no cookie, parse `shippie_session`, look up `user_id` in KV access list
4. Check KV `access:{slug}` value version to invalidate stale sessions (session stores a `access_version` seen-at timestamp)

Reserved `/__shippie/*` routes are exempt from the gate (they need to serve the manifest + icons + SDK even to unauthenticated visitors, though we obscure any slug-identifying info).

## 11. Ratings + events for private apps

- Private apps' events still write to `usageDaily` with an `is_private=true` flag carried from `apps`
- Trending / top-rated / new-this-week queries add `and not is_private`
- Maker dashboard sees their own private app's analytics unchanged
- `/api/ingest` path needs no change — ingest doesn't compute leaderboards; rollups do

## 12. Abuse / security considerations

| Concern | Mitigation |
|---|---|
| Someone brute-forces tokens | 12-char URL-safe random = ~71 bits of entropy; rate-limit `/api/invite/*/claim` per IP |
| Invite link shared more widely than intended | Maker sets `max_uses`; audit via `app_invites.used_count` |
| Malicious maker creates a phishing private app | Slug reservation + abuse review same as public apps; private status doesn't exempt from TOS |
| Cookie theft via XSS on maker's own app | `__Secure-` / `__Host-` prefixes; `SameSite=Lax`; rotating secret; revoke-by-token invalidates via `used_count` |
| Search engines finding private pages | `X-Robots-Tag: noindex, nofollow` on all private-app responses + `<meta name="robots" content="noindex">` on the marketplace page + excluded from sitemap.xml |
| User reverse-engineers by noticing 401 instead of 404 | Worker serves the 401 page only if they hit the exact slug subdomain. Control plane (`/apps/{slug}`) returns 404 uniformly. |

## 13. What ships in Phase B (link invites)

- `app_access`, `app_invites` tables + migration
- `visibility_scope = 'private'` across control plane queries
- Link-invite creation (maker) + claim flow (visitor)
- Invite cookie HMAC + verification helper
- Runtime Worker access gate
- `/invite/[token]` accept page
- `/dashboard/apps/[slug]/access` management page
- API endpoints listed in §8 (email endpoints return `501 not_implemented`)
- CLI: `shippie invite <slug> [--max-uses N] [--expires D]` — link only

## 14. What ships in Phase C (email invites + polish)

- Email-type invites: recipient-email binding + nodemailer delivery
- CLI `--email` flag
- Invite rate limiting
- Audit log of access grants / revokes for maker visibility
- Bulk invite (paste CSV of emails)
- Optional: Slack-style magic join links the maker can rotate without invalidating existing access

## 15. Risks

1. **Cookie propagation between apex and subdomain.** `__Host-` can't cross subdomain boundaries. We use two parallel cookies with different prefixes. Needs an e2e test that claiming on `shippie.app/invite/…` lets the visitor view `{slug}.shippie.app` without re-claiming.
2. **KV propagation lag.** After the maker revokes an access, how fast does the runtime Worker reflect it? Target: ≤ 5 seconds. Achieved by the existing signed-request KV invalidation. Needs to be proven under load.
3. **Anonymous claim abuse.** Nothing stops one invitee from forwarding the URL. `max_uses` is the only lever. We document this — "treat link invites like anyone-with-the-link access."
4. **Private app in leaderboard queries.** New `is_private` filter must not be missed. Ship it in one commit touching every rollup query; test via a fixture private app that generates events but doesn't appear.

## 16. Success criteria

- Maker creates a private wrapped app, creates a link invite, sends it to themselves on another device, opens the link, claims, sees the app, installs it to home screen.
- Public `/apps`, `/leaderboards/*`, and search never surface the private app.
- Logged-out visitor to `/apps/{private-slug}` gets the same 404 as for a nonexistent slug.
- Maker revokes access → within 5s the invitee loses the ability to load the app (on next request).
- Private app's events appear on the maker's own dashboard but never in public trending.

## 17. Explicit non-scope

- Team-owned apps (multiple makers). Today `apps.maker_id` is a single user. Out of scope — org ownership is a separate initiative.
- SSO / SAML integration for access grants. Out of scope.
- Per-feature gating (some users see some pages). The gate is binary: access the whole app or not at all.
- Payment-gated access. Out of scope.
