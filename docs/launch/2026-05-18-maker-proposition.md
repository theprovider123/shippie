# Maker proposition + product tightening — 2026-05-18

> Complement to `2026-05-18-pre-launch-plan.md`. That plan asks *what's broken or missing for launch.* This plan asks *what makes Shippie feel like the home for tiny apps* — the maker growth loop, the user trust loop, and the propositional copy that connects them.
>
> Grounded in source review + live HTML probes against worker `e2aa57c8` (deployed 2026-05-18 07:21 UTC).

---

## Two loops to keep in mind

### Maker growth loop
```
Ship → Learn → Improve → Upgrade → Remix
```
- **Ship**: `/new` → live URL in seconds
- **Learn**: feedback inbox + basic privacy-safe analytics
- **Improve**: changelog + roadmap from feedback votes
- **Upgrade**: redeploy via zip / CLI / MCP / GitHub
- **Remix**: source + license + lineage so apps compound

### User trust loop
```
Discover → Install → Use → Inspect → Backup → Recover
```
- **Discover**: apex + collections + leaderboards
- **Install**: 60s to PWA on home screen
- **Use**: offline, no account, no signup
- **Inspect**: trust card surfaces every promise
- **Backup**: Drive/Files round-trip when chosen
- **Recover**: `/you` is the always-available data home

These are the two propositions. Every surface tightens one or both, or it's not pulling its weight.

---

## Headline copy (refined)

| Audience | Promise | Where it lives |
|---|---|---|
| **Makers** | "Ship a tiny web app and get install, feedback, analytics, updates, trust, remix, and sharing — for free." | `/build`, `/new`, `/dashboard` empty state |
| **Users** | "Small tools that run on your device. Your data stays here. Shippie tells you when it doesn't." | `/`, `/apps/[slug]` trust card, `/you` |
| **Remixers** | "Remixable apps publish source + license + lineage. Fork, improve, deploy — credit preserved." | `/apps/[slug]` "Remix this app" CTA |
| **Shippie identity** | "The home for useful small apps: simple to ship, safe to use, easy to remix." | apex hero, README, whitepaper |

---

## Audit-grounded findings

For each of your 16 P0/P1 items: what exists at HEAD, what's missing, what changes.

### P0.1 Post-deploy Launchpad

**What exists**: `apps/platform/src/routes/new/upload-form.svelte:210+` renders an inline success branch after a successful deploy. It already shows:
- ✓ Shipped + version
- ✓ Live URL with QR for "scan to open on phone"
- ✓ Open app + Flight Recorder + Export JSON
- ✓ Share URL + copy button
- ✓ Visibility toggle (public/unlisted/private)
- ✓ Claim path if trial-mode

**What's missing** (the user's checklist):
- ❌ "Add feedback button" snippet card
- ❌ "View trust card" affordance (where does maker check what data the app uses?)
- ❌ "Mark remixable" toggle (sourceRepo + license + remix permission in one card)
- ❌ "Connect GitHub for auto-deploys" link
- ❌ "Watch first analytics event" — empty preview tile
- ❌ "Mark Remixable" / "Publish source" CTA
- ❌ "First event lands here →" with a link to `/dashboard/apps/[slug]/analytics`

**Fix shape** (≈2-3 hours):
Promote the success branch from an inline form-result into a dedicated `apps/platform/src/routes/new/launchpad/[deployId]/+page.svelte` route. Keep the existing inline success block as the redirect target. The Launchpad becomes its own surface with:

```
✓ Shipped — recipe-saver v3
Live at recipe-saver.shippie.app  [Open]  [QR]  [Share link]

Get more from your app                    [skip for now]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
☐ Add a feedback button             [Copy snippet]
☐ Turn on basic analytics            [Copy snippet]
☐ Publish source for remixing        [Edit profile]
☐ Connect GitHub for auto-deploys    [Connect]
☐ Watch your first event             [Open analytics]

What users see                             Privacy
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Trust card preview — same shape          • Data stays on device by default
 the public app page shows]                • Basic analytics only — no raw data
                                           • Backup: encrypted, Drive/Files
                                             only when user opts in
```

Each ☐ is a real toggle — checked items disappear or move to a "done" tray. State persists per app (D1 `app_checklist_state` table or computed on-the-fly).

### P0.2 Feedback Inbox

**What exists**:
- `/dashboard/feedback` — account-wide inbox (60 lines, basic shell)
- `/__shippie/feedback` — SDK POST receiver
- `packages/sdk/src/wrapper/runtime-bundle.ts:263` — `feedback.submit` stub (just warns; the real SDK in `packages/sdk/src/feedback.ts` likely has the implementation)

**What's missing**:
- ❌ Per-app feedback inbox at `/dashboard/apps/[slug]/feedback` (the global inbox is fine but per-app focus matters)
- ❌ "How to add feedback to your app" snippets (SDK code, React FC, plain HTML floating button)
- ❌ Feedback categories (bug / idea / praise / question) and vote counts
- ❌ Maker reply / mark-as-done / mark-as-planned state
- ❌ Public-facing feedback widget visibility (visitor sees "this app has feedback, drop yours")

**Fix shape** (≈3-4 hours):
1. Add `dashboard/apps/[slug]/feedback/+page.svelte` + `+page.server.ts` showing only this app's items.
2. Add a "Add feedback to your app" card on the Launchpad with three tabs (SDK / React / Vanilla HTML floating button). Each tab shows ~10 lines of copy-paste code.
3. Add `feedback_status` column to the feedback table: `'open' | 'planned' | 'shipped' | 'declined'`. Maker can mark items; planned/shipped items become a public roadmap if visibility allows.

### P0.3 Basic Analytics (privacy-preserving)

**What exists**:
- `/dashboard/apps/[slug]/analytics` — usage events dashboard
- `/__shippie/analytics` — SDK POST receiver
- Daily rollups via cron `0 * * * *`

**What's missing**:
- ❌ Privacy promise above the fold: *"Basic usage only. No raw app data. No personal data unless you explicitly declare identifiable analytics."*
- ❌ Comparison row: *"What Shippie sees"* vs *"What Shippie doesn't see"* (with `❌ raw form data / ❌ user identity unless you opt in`)
- ❌ Per-event privacy classification — events tagged `safe-aggregate` vs `requires-disclosure`
- ❌ "Watch first event" empty state pointing back to Launchpad

**Fix shape** (≈1 hour):
Add a single-line header to `dashboard/apps/[slug]/analytics/+page.svelte`:
> "Opens, installs, returning users, latest event. **No raw app data. No user identity** unless your app explicitly declares identifiable analytics."

Plus a "What gets recorded" disclosure expandable with the same copy users see at `/you`.

### P0.4 Leaderboards / Rankings

**What exists**:
- `/leaderboards` route exists at 158 lines
- `+page.server.ts` returns hard-coded `{ trending: [], rising: [], rated: [] }` — **placeholder only**
- `/api/collections/official/+server.ts` — Collections endpoint

**What's missing**:
- ❌ Real data piping into trending/rising/rated
- ❌ "Most remixed" and "Most installed" shelves
- ❌ Game-specific leaderboards (opt-in score events) — for showcase-arcade games
- ❌ Maker-private growth rank inside their dashboard (different from public)

**Fix shape — the user's three-way split is the right one** (≈4-6 hours):

1. **Public app leaderboards** (`/leaderboards`):
   - Trending (this week's velocity from cron rollups)
   - New (last 7 days, first-party + claimed user apps)
   - Most installed (lifetime installs)
   - Most remixed (lineage count)
   
   Wire the existing `app_event_rollups` (or equivalent) into `+page.server.ts`. The placeholder shape is already there.

2. **Game leaderboards** — separate route `/leaderboards/games/[slug]/+page.svelte`. **Opt-in only via `shippie.analytics.score({slug, score})` event**. Showcases that opt in (Snake, Bricks, Drift, Memory Grid, Lustre, Bulwark, Sudoku) appear; others don't.

3. **Maker growth rank** — a small card on `/dashboard/apps/[slug]/+page.svelte`: "This week: +12 opens (rank #34 in food-drink). Up from #41."

Critical: **do NOT publish global leaderboards for private/local tools**. Mark `Recipe Saver` or `Journal` with `analytics.public: false` and they never appear on `/leaderboards`. The visibility flag is already a thing.

### P0.5 Remix Surface

**Bug confirmed at `apps/platform/src/routes/apps/[slug]/+page.server.ts:160-161`**:
```ts
const sourceRepo = lineage?.sourceRepo ?? app.githubRepo ?? null;
const remixAvailable = Boolean(sourceRepo && lineage?.license && lineage?.remixAllowed);
```

**Problem**: For first-party showcases (`signingTrust.scope === 'first-party'`), neither `lineage.sourceRepo` nor `app.githubRepo` is set, so `remixAvailable = false` — even though `coffee` IS open source, lives at `github.com/shippie/shippie/tree/main/apps/showcase-coffee` under AGPL-3.0, and the CLI `npx @shippie/cli remix coffee` works (per README.md).

The result: `/apps/coffee` displays "Source not published / Remix closed" + "Remix unavailable until the maker publishes source + license", **which is wrong**.

**Fix** (≈30 min):
In `+page.server.ts:160-161`, branch on `signingTrust.scope === 'first-party'`:
```ts
const isFirstParty = signingTrust?.scope === 'first-party';
const sourceRepo = lineage?.sourceRepo ?? app.githubRepo ?? (
  isFirstParty
    ? `https://github.com/shippie/shippie/tree/main/apps/showcase-${app.slug}`
    : null
);
const license = lineage?.license ?? (isFirstParty ? 'AGPL-3.0' : null);
const remixAvailable = Boolean(sourceRepo && license && (lineage?.remixAllowed || isFirstParty));
const remixVia = isFirstParty ? 'cli' : 'web';   // affects CTA wording
```

Then `apps/platform/src/routes/apps/[slug]/+page.svelte` ownership-actions section renders:
- If `remixVia === 'cli'`: **"Remix this app"** button revealing `npx @shippie/cli remix <slug>` with copy-to-clipboard
- If `remixVia === 'web'`: **"Remix this app"** button POSTing to `/api/apps/[slug]/remix`

**Public CTA** also goes near the install button in the hero row:
```
[Open Coffee]  [Share]  [♡ Favorite]  [Remix →]
```

### P0.6 Update/Upgrade Flow

**What exists**:
- `dashboard/apps/[slug]/deploys/[deployId]/+page.svelte` — deploy detail
- `dashboard/apps/[slug]/` overview likely shows recent deploys
- CLI flow: `npx @shippie/cli deploy ./dist`
- MCP flow: documented in `/new` toolbelt section

**What's missing**:
- ❌ Rollback affordance from deploys list (clicking a prior deploy should offer "Roll back to this version")
- ❌ Changelog input on deploy (current deploys are nameless; ask for a one-line changelog when deploying)
- ❌ "Users see your update" cue — does the SW evict cache on new version? Per `2026-05-08` session, `CF_VERSION_METADATA` is wired into cache name. Surface that to maker: "Users will get v3 on their next app open."

**Fix shape** (≈2 hours):
1. Add a `changelog` text input to `upload-form.svelte` (optional, single line). Surfaces as the deploy's display title in `/deploys` list.
2. Add "Roll back to this version" button to `dashboard/apps/[slug]/deploys/[deployId]/+page.svelte` — calls existing POST endpoint that swaps the live version.
3. After a deploy lands, surface a small toast on `/dashboard/apps/[slug]`: *"v3 is live. Users will see it on their next open."*

### P0.7 Trust Card

**What exists**:
- `/apps/[slug]/+page.svelte` has a "Trust signal" / "Shippie-signed" section
- App Kinds vocabulary (`Local / Connected / Cloud`) in `docs/app-kinds.md`
- Capability badges via cron rollup at `0 4 * * *`
- `pwaReadiness` field on app payload

**What's missing**:
- ❌ Trust card is buried mid-page. Should be above-the-fold for users (just below hero, just before action buttons)
- ❌ App Kind is rendered as bare metadata, not the headline of trust ("Local — your data never leaves this device")
- ❌ External domains list not shown
- ❌ Permissions list (camera/mic/notifications/files) not shown to user before install

**Fix shape** (≈1-2 hours):
Lift the trust block to be the second section on `/apps/[slug]` (right under the hero). New shape:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
What this app uses

🏠 Runs on your device — your data stays here
📷 Asks for camera once   ✖ no microphone
📡 Talks to: (nothing — fully offline)
💾 Backup: optional, your choice of Drive or Files
🛡 Shippie-signed · AGPL-3.0 · Remixable

[Install Coffee →]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Each line is computed from existing fields (app kind, permissions array, allowed_connect_domains, signing trust, license). Render with explicit ✖/✓/❓ status so the user reads the answer fast.

### P0.8 User Data Control (`/you`)

**What exists**: `/you/+page.svelte` (613 lines) — substantial. Sections: This device / Saved / Recent / Local data / Account.

**What's missing**:
- ❌ Trust framing as the headline ("What Shippie sees / What Shippie doesn't see")
- ❌ "Per-app data" table — for each installed app, what's stored, last touched, size, action (open / clear / export)
- ❌ "Move to another phone" flow surfaces cleanly (already lives in container Your Data — link to it from `/you`)

**Fix shape** (≈1-2 hours):
Add a header band above "This device":
```
Your data on Shippie
━━━━━━━━━━━━━━━━━━━━
✓ Apps run on your device
✓ Storage stays here unless you back up
✓ Backups are encrypted, only you have the key
✖ Shippie has no copy of your app data
✖ Shippie doesn't track you across apps
```

Below: list-per-app with sortable size + lastTouched columns. Already half-exists in container's Your Data tab — port that to `/you` so it's accessible without entering an app.

### P0.9 Share / Invite

**What exists**:
- `/run/[slug]/` URLs + subdomain URLs
- Share button on `/apps/[slug]` hero (via `share-btn` class)
- QR component used in `upload-form.svelte` success state and elsewhere

**What's missing**:
- ❌ Consistent share affordance across all surfaces (app detail, dashboard, container Your Data, focused-mode)
- ❌ Private-invite flow for `visibility: private` and `unlisted` apps — does the share button include a token?
- ❌ Native `navigator.share()` integration on mobile

**Fix shape** (≈1 hour):
Promote share into a `<ShareSheet>` primitive that takes `{ url, title, visibility, token? }`. Behavior:
- Mobile (`navigator.share` available): native share sheet
- Desktop: copy + QR + email pre-fill
- Private apps: appended invite token; share renders "This link works for 7 days"

Same shape across `/apps/[slug]`, `/dashboard/apps/[slug]`, container, focused-mode.

### P0.10 Templates / Starter Paths

**What exists**:
- `bun apps/platform/scripts/new-showcase.mjs <slug>` — CLI scaffold
- `templates/showcase-template/` — minimal Vite + React template
- README mentions `npx @shippie/cli remix <slug>` for first-party

**What's missing**:
- ❌ Web-side template gallery — `/new` doesn't offer "start from a template"
- ❌ Mapping templates to job-shapes: tracker, game, checklist, room, calculator, journal
- ❌ "Start from remix" path — combine with P0.5 remix CTA on each app

**Fix shape** (≈3-4 hours):
Add a "Start from…" section above the upload form on `/new`:
```
What are you shipping?
━━━━━━━━━━━━━━━━━━━━━━
[blank tool]    [tracker]    [game]    [room]
[checklist]    [calculator]  [journal] [remix existing]
```

Each opens a fork-flow: `templates/<kind>/` → `npm run dev` instructions OR (for "remix existing") → `/apps` filtered to remixable.

---

## P1 — Launch week additions

### P1.11 Feature Requests as Roadmap

Feedback items can be marked `planned` / `shipped` / `declined`. **Public roadmap auto-renders** at `/dashboard/apps/[slug]/roadmap` (public if app visibility permits). Makes Shippie useful AFTER deploy, not just AT deploy. (Builds on P0.2 feedback state machine.)

### P1.12 Changelog

Per-app changelog at `/apps/[slug]/changelog`. Auto-populated from deploys (P0.6). Maker can edit each line. Public link from the app detail page hero. Surfaces the "Updated recently" badge users can rely on.

### P1.13 App Health

Maker dashboard surfaces: failed deploys, wrapper errors, feedback spikes, crashes. Lives at `/dashboard/apps/[slug]/health` (a new sub-route). Read from existing event tables; aggregate. Tie into the App Kinds dispute flow that already exists (`docs/app-kinds.md`).

### P1.14 Audience Growth (privacy-safe)

Show maker: referrers (top 3, anonymized), share counts, install conversion. Never expose individual sessions. Aggregate-only. Lives on `/dashboard/apps/[slug]/analytics` as a second tab "Where they came from."

### P1.15 Collections

`/api/collections/official/+server.ts` already exists. Surface on apex + `/apps`:
- **Best local tools** (offline-first showcase highlights)
- **Remixable starters** (open-source first-party + opted-in user apps)
- **Games** (arcade slate)
- **For events** (Live Room + Tab + Crewtrip)
- **For makers** (Localize, Pitch Forge, Story Studio)

Each collection is a curated slug list in code; surface as horizontal scrollers on apex. Already the shape the Glance/Today magazine surfaces use.

### P1.16 Docs that match the product

`/docs` is currently a stub (per pre-launch plan M4). Rewrite as job-shaped sections:
- **Ship** (CLI / MCP / GitHub / Zip)
- **Feedback** (turn it on, snippets, inbox)
- **Analytics** (privacy promise, score events, audience)
- **Remix** (publish source, license, lineage)
- **Data** (where it lives, backup, recovery)
- **Trust** (proof, badges, App Kinds)

Each doc answers one job, ~600-800 words max. No giant docs wall.

---

## Recommended build order

P0.5 (remix mismatch fix) is the smallest unblocker — start there. Then the Launchpad lifts everything else.

| # | Item | Time | Why this position |
|---|---|---|---|
| 1 | **P0.5 fix** — first-party remix branch in `+page.server.ts:160` | 30 min | Visible bug, smallest blast radius, immediately makes 62 showcases appear remixable |
| 2 | **P0.7** Lift trust card above the fold on `/apps/[slug]` | 1-2h | Headline change to user trust loop. Reuses existing fields |
| 3 | **P0.2** Per-app feedback inbox + SDK snippets card | 3-4h | Locks in the maker growth loop |
| 4 | **P0.3** Privacy header + classification on analytics | 1h | Cheap to do; aligns with H7/H8 of pre-launch plan |
| 5 | **P0.1 Launchpad** — promote success branch to dedicated route | 2-3h | Synthesises 2-4 into the maker's first 5 minutes |
| 6 | **P0.5** Public "Remix this app" CTA | 1h | Now that the bug is fixed, surface the CTA |
| 7 | **P0.8 `/you` trust header** + per-app data table | 1-2h | User trust loop ceiling |
| 8 | **P0.4** Wire real data into `/leaderboards` (trending + most installed) | 3-4h | Discovery surface |
| 9 | **P0.10** Template gallery on `/new` | 3-4h | Reduces blank-page paralysis |
| 10 | **P0.6** Changelog input + rollback affordance | 2h | Improves the Upgrade arm of the maker loop |
| 11 | **P0.9** `<ShareSheet>` primitive — share parity across surfaces | 1h | Cross-cutting polish |
| 12 | **P1.15** Collections shelves on apex | 2h | Magazine-shape discovery |
| 13 | **P1.16** Docs job-shaped rewrite | 4h | Subsumes pre-launch M4 |
| 14 | **P1.11** Feature requests state machine + public roadmap | 3h | Makes feedback compound |
| 15 | **P1.12** Per-app changelog from deploys | 2h | Closes the upgrade loop visibly |
| 16 | **P1.13** `/dashboard/apps/[slug]/health` | 2h | Maker confidence |
| 17 | **P1.14** Audience growth (referrers + conversion) | 2h | Bonus, can ship post-launch |

Cumulative: **≈35-45 hours** of focused work for the full list. P0 alone (#1–#11) is ≈19-26 hours.

---

## How this connects to the pre-launch plan

| Pre-launch item | Maker-proposition item | Relationship |
|---|---|---|
| H3 (dashboard sub-routes hidden) | P0.1 Launchpad | Launchpad replaces the orphan-sub-route problem with an opinionated default surface |
| H5 (trust message never seen) | P0.7 Trust card above fold + P0.8 `/you` header | Same problem, two surfaces |
| H7 (per-route OG missing) | P1.15 Collections | OG generation for collection routes belongs in the same change |
| M4 (`/docs` is a stub) | P1.16 Docs job-shaped | Same fix, sharper framing |
| M9 (deploy error remediation links) | P0.1 Launchpad | The Launchpad is the antidote to "errors with no next step" |
| M12 (Your Data lands on Devices) | P0.8 `/you` per-app data | Same gap viewed from two routes |

**Recommendation**: roll the maker-proposition P0 work and the pre-launch plan together. There's no clean separation — they're the same product made coherent.

---

## Decision points

1. **Launchpad as a route or a state?** Dedicated `/new/launchpad/[deployId]` vs the existing inline success branch. The former is shareable + bookmarkable; the latter is simpler. Recommend route.

2. **Feedback visibility default**: when a maker enables feedback, do submitted items default to public-list (open inbox) or private-to-maker (closed inbox)? Recommend **private by default**, with explicit toggle to make individual items public (e.g., for roadmap).

3. **Leaderboards game scoring**: opt-in per showcase via `shippie.analytics.score()`. But: **score events on games are inherently identifying** (one user submitting scores). Either anonymize aggressively (top 10 only, no per-user history) or require explicit user opt-in. Recommend top-10 + per-user explicit toggle.

4. **Template gallery surface**: on `/new` (combined deploy + browse) vs `/templates` (separate). `/new` is denser; `/templates` is clearer. Recommend `/templates` as the gallery, with a "start from a template" link in `/new`.

5. **First-party remix CLI affordance**: the fix above branches `remixVia: 'cli' | 'web'`. For CLI path, do we link to a hosted IDE (e.g., StackBlitz) for one-tap remix, or stay CLI-only? CLI is cheaper to ship; hosted IDE is more accessible. Recommend CLI now, hosted later.

6. **Bundle this work or land in lanes**: shipping 17 items takes weeks. Decide between (a) freeze new features until done, (b) lane the work across Claude + Codex with the existing moratorium rules, (c) accept partial — ship P0.1+P0.5+P0.7 only for launch, rest as v1.1.

---

## What stays out

- Native app distribution.
- A separate "Shippie account" identity. Email auth + GitHub OAuth is enough; no profile builder.
- Cross-app social features (likes, comments, follows). The user's review flagged these as anti-pattern for the trust loop.
- Per-user app analytics (cross-installation tracking). Aggregate-only.
- "Recommended for you" personalization. Curated collections only.

These are explicit non-goals. They look attractive and would break the trust loop.

---

---

## Revisions (post-Codex review — 2026-05-18)

Codex reviewed the v1 of this plan and tightened it correctly. The biggest call was: *adding seven new surfaces (`/new/launchpad`, `/templates`, public roadmap, game leaderboards, health, changelog, audience growth) right before launch trades clarity for activity.* The revised plan converges paths instead.

**Locked decisions** (these stand for launch):

1. **Launchpad** is `/dashboard/apps/[slug]`, **not** a new route. The deploy success state at `upload-form.svelte:210+` stays inline for the no-signup trial case, with a clear "claim this app" path. Once claimed, the dashboard becomes the canonical surface for: live URL, QR/share, feedback snippet, analytics setup, remix/source settings, update flow, trust card.
2. **Feedback** is private by default. Public roadmap deferred to P1+.
3. **Leaderboards** ship as aggregate app-level only (New / Trending / Remixable / Popular-with-makers). No game scoreboards before the privacy/schema story is locked.
4. **Templates** are a compact "Start from a remix/template" row inside `/new`. The `/templates` route comes later.
5. **Remix** is CLI-first. Hosted IDE remix deferred.
6. **Checklist state** is computed from existing facts (`deployedAt`, `claimedAt`, `sourceRepo`, feedback count, analytics event count, GitHub connection), not persisted in a new table. Only dismissals get persisted, and only if we need them.

**Technical corrections to the remix fix** (P0.5):

I described inlining a `signingTrust.scope === 'first-party'` branch into `apps/platform/src/routes/apps/[slug]/+page.server.ts:160`. That was wrong. The shared logic already exists:

- `apps/platform/src/lib/server/remix/eligibility.ts:24` — `remixEligibilityForSlug()`
- `apps/platform/src/lib/showcase-slugs.ts:84` — `isFirstPartyShowcase()`
- `firstPartySourceRepo()` in `eligibility.ts:122` already uses the correct repo `theprovider123/shippie` and license `AGPL-3.0-or-later`

**The actual asymmetry**:
- `apps/platform/src/routes/api/apps/[slug]/remix/+server.ts:23` uses `remixEligibilityForSlug()` — single source of truth
- `apps/platform/src/routes/apps/[slug]/+page.server.ts:160-161` does NOT use it — inlines its own (buggy) version

**Correct fix shape** (≈45 min):
1. Extract a thinner helper from `eligibility.ts` (or wrap it) — call it `publicRemixInfoForSlug(db, slug)` — that returns the public-page-shaped data: `{ sourceRepo, license, remixAvailable, remixVia: 'cli' | 'web' }` for any slug, or null if not remixable.
2. Replace lines 160-161 of `+page.server.ts` with a call to that helper.
3. The page server stops constructing its own `sourceRepo` / `remixAvailable` and passes through what the helper says.

**A second bug surfaces during verification**:

I curl'd `/api/apps/coffee/remix` on prod and it returned HTTP 400 with `"The maker has not published source, license, and remix terms."` But `coffee` IS in `FIRST_PARTY_SHOWCASE_SLUGS` and `first-party-curation.ts`. The eligibility helper SHOULD hit its first-party branch (lines 56-72) and return `ok: true`. It didn't. That means one of: (a) the deployed DB row for `coffee` has `isArchived: true` or `visibilityScope !== 'public'`, or (b) `coffee`'s curation surface is `'archived'`. **Investigate this before shipping P0.5** — fixing the page server alone won't help if the eligibility helper itself disagrees with reality. Run: `bunx wrangler d1 execute shippie-platform-d1 --remote --command "SELECT slug, visibility_scope, is_archived FROM apps WHERE slug = 'coffee';"`.

**Revised P0** (Codex's list, in order — replaces the prior #1-11):

| # | Item | Time |
|---|---|---|
| 1 | **Fix remix mismatch** via shared `publicRemixInfoForSlug()` helper. Investigate the second bug (eligibility returning 400 for coffee). | 1-1.5h |
| 2 | **Lift trust + remix + data cards above the fold** on `/apps/[slug]`. The "Trust signal" section moves immediately under the hero. | 1-2h |
| 3 | **Make `/dashboard/apps/[slug]` feel like a launchpad** — surface live URL, QR, share, feedback-snippet card, analytics card, remix toggle, trust card, update path. No new route; reorganise the existing page. | 3-4h |
| 4 | **Per-app feedback inbox + setup snippet** at `/dashboard/apps/[slug]/feedback`. Private by default. SDK / React / Vanilla HTML snippet cards. | 3-4h |
| 5 | **Analytics privacy framing** — header line + "What gets recorded" disclosure + "Waiting for first event" empty state. | 1h |
| 6 | **Tighten `/you`** — trust header band, per-app data table, what-Shippie-sees vs doesn't. | 1-2h |
| 7 | **Public aggregate shelves** — `/leaderboards` page wired to real data: New / Trending / Remixable / Popular-with-makers. No per-user data. | 3-4h |
| 8 | **Compact "Start from…" row** in `/new` (template + remix selector). Not a new route. | 1-2h |
| 9 | **Verify stale SW behavior** for new docs/remix pages — the user's earlier observation that `/docs/remix` rendered 404 in an installed PWA even though the endpoint works live. Walk through the cache-invalidation path post-deploy. | 1h |

**Cumulative**: ≈15-22 hours. Compare to v1 at 19-26h for the first eleven items — tighter by ~30% and lands cleaner because every path converges on an existing surface.

**Moved to P1/P2** (post-launch, not blocking):
- `/templates` standalone route
- Public roadmap from feedback
- Game leaderboards (privacy story not yet locked)
- App health center
- Audience growth analytics
- Hosted IDE remixing
- Full changelog product
- Public per-feature voting

These are all good. They're just not the first launch story.

**Convergence rule** (the principle behind the tightening):
> Every maker path should converge on `/dashboard/apps/[slug]`. Every user path should converge on app detail (`/apps/[slug]`), `/you`, or the launcher (`/`).

If a proposed surface doesn't converge on one of those, it earns scrutiny before earning a route.

---

## Glossary (the words that should appear everywhere)

These are the words to keep saying. If a surface uses different words for the same concept, fix the surface.

| Concept | Word |
|---|---|
| Local-first | **on your device** (not "client-side") |
| No account | **no signup** (not "no auth") |
| Backup | **encrypted backup to your Drive** (not "cloud sync") |
| Source | **published source** (not "open repo") |
| Lineage | **parent lineage** (not "fork tree") |
| Remix | **remix** (not "fork" or "clone") |
| Permission | **what this app uses** (not "permissions" — too techie) |
| Update | **update** (not "version bump" or "release") |
| Feedback | **feedback** (not "issues" or "reviews" — those are different) |
| Trust card | **trust card** (the canonical name) |
| App Kind | **Local / Connected / Cloud** (don't introduce new terms) |
