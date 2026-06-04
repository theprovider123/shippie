# Maker Backend Cleanup — Review & Phased Plan

> **For agentic workers:** REQUIRED SUB-SKILL when executing: superpowers:subagent-driven-development (or executing-plans), one phase at a time with review checkpoints. **Do not implement until this plan is reviewed.** Steps use checkbox (`- [ ]`) tracking.

**Goal:** Rebuild the maker/account "All apps" flow so the maker backend feels like the same product as the new Dock / Tools / You frontend — one clean shell, a scalable apps list, a simple app detail, and a tool-drawer-style share — mobile-first.

**Architecture:** Keep the existing SvelteKit routes + D1-backed loaders. Unify route ownership under `/maker/*` (with `/dashboard/*` kept as compat aliases), replace the legacy dashboard `Sidebar` shell with a Dock/Tools/You-aligned maker shell, and make the apps list row-based + searchable/sortable/paginated. No new backend platform; reuse existing loaders and the showcase-kit share sheet.

**Tech Stack:** SvelteKit (apps/platform) · Cloudflare Workers · D1 · existing `@shippie/showcase-kit-v2` `QrShareSheet` · vitest (platform) · Playwright smoke.

**Branch:** `review-implementation-2026-05-23`. Builds on commit `ff5b0804` (global Nav already suppressed on `/dashboard` + `/maker`) and `b9263e72` (showcase smoke tests).

---

## 1. Findings (current state, HEAD-verified)

### 1.1 Entry path from `/you`
`apps/platform/src/routes/you/+page.svelte`
- A "Your apps" section (`:133` `<h2>Your apps</h2>`) shows the app count (`:114`), a **pinned grid of up to 12 apps** (`:51` `pinnedMakerApps = data.makerApps.slice(0, 12)`), each with a `Manage` link → `/maker/apps/${slug}` (`:158`), an `All apps` link → `/maker/apps` (`:137`), and `Ship app` → `/new` (`:167`). Footer/extra `Maker` links → `/maker` (`:189`) and `/maker/apps` (`:287`).
- **Issues:** the inline 12-app grid does not scale and duplicates the list page; labels are inconsistent across one screen ("Your apps" heading, "All apps" link, "Maker" links). The maker entry should be a *compact* block, not a mini app list.

### 1.2 Route ownership / redirects
- `/maker/+page.server.ts`: logged-out → `303 /auth/login?return_to=/maker`; logged-in → `307 /dashboard`.
- `/maker/[...path]/+page.server.ts`: same pattern → `307 /dashboard/<path>`.
- So **`/maker/*` are thin redirect aliases; the real pages live under `/dashboard/*`.** Yet **every maker link in the UI points to `/maker/apps/*`** (you page, list rows, detail tabs) → every click is a **307 hop** to `/dashboard/*`. Route ownership is split and confusing; the URL bar flips `/maker` → `/dashboard` after each navigation.

### 1.3 Apps list — `apps/platform/src/routes/dashboard/apps/+page.svelte`
- Header: `.maker-head` with eyebrow `Maker · apps` (`:14`) + `<h1>Apps</h1>` (`:16`) + a 3-box `.summary-grid` (Total / Live / Private, `:31-39`). Title tag is "Maker apps · Shippie".
- List: `<section class="app-list">` → `{#each data.apps as app}` renders **every app** as an `.app-row` (swatch, name, `slug.shippie.app`, a `type` badge, `latestDeployStatus`, `visibilityScope`, relative `lastDeployedAt`, and a single `Manage` link). `:70`.
- **Issues:**
  - **No search, no filter, no sort, no pagination** — renders all rows unconditionally. Breaks at 100s/1000s of apps.
  - Row is a desktop CSS grid of 6 columns → on 390px it will wrap/cramp (no mobile-condensed layout).
  - **Status is raw/technical**: `latestDeployStatus` ("success"/"draft") and `visibilityScope` shown verbatim. No human "Live / Draft / Updating / Public / Private".
  - **No at-a-glance metrics** (opens/views/feedback) on rows.
  - **Quick actions = only "Manage"** (no Open, no Share/copy-link).
  - Empty state (`:42-67`) is decent but includes a developer-facing **"Demo app diagnostics" `<details>`** that should not ship in the product surface.

### 1.4 App detail — `apps/platform/src/routes/dashboard/apps/[slug]/+layout.svelte`
- Header: swatch + eyebrow breadcrumb `Maker · apps` + `<h1>{app.name}</h1>` + a single `Open` link (→ `https://<slug>.shippie.app/`) + tagline.
- **Six tabs**: Overview, Feedback, Analytics, Access, Profile, **Proof** — all linking to `/maker/apps/<slug>/*` (307 hops), active-state checks both `/dashboard` and `/maker` paths.
- **Issues:** 6 tabs is heavy; "Proof" is jargon; **no Share/copy-link** in the title row (only Open); breadcrumb eyebrow is redundant chrome; metrics are buried behind the Analytics tab rather than a compact strip up top.

### 1.5 Maker shell / chrome
- `dashboard/+layout.svelte` renders `Sidebar` (`$components/dashboard/Sidebar.svelte`): a **208px fixed paper-warm sidebar** with a "shippie / maker" sub-brand, nav (Maker / Apps / Feedback — "Home"→"Maker" already fixed in `ff5b0804`), a "Ship app" button, and a "Recent" list. On ≤760px it collapses to a horizontal chip row.
- The duplicate **two-"shippie"** chrome is **already fixed** (`ff5b0804` hides the global `Nav` on `/dashboard`+`/maker`; the Sidebar brand links to `/dock`).
- **Remaining issues:** the Sidebar is the **old dashboard visual language** (warm paper, fixed rail) — not Dock/Tools/You. On mobile the Sidebar chip-row + the page `.maker-head` ("Maker"/"Apps") stack as **two headers**. A site `Footer` also renders on maker pages (low priority).

### 1.6 Login / `return_to` friction — `apps/platform/src/routes/auth/login/+page.server.ts`
- `loginIntentFor('/maker/...')` → `'maker'`, but `localContinueTarget()` **bounces any `/maker`, `/dashboard`, `/new` returnTo to `/dock`** (`:28-42`). So a logged-out user opening `/maker/apps` → login → may **land on `/dock`, not back on the apps list** (depends which target the load uses). This is the `return_to` friction the brief calls out — needs to be verified and fixed so maker-intent logins land on the maker apps page.

### 1.7 Sharing / analytics / labels
- **No share affordance** anywhere in maker (list or detail) beyond opening the live URL. The product has a clean `QrShareSheet` (`@shippie/showcase-kit-v2`) used by the tool drawer — maker should reuse it.
- **Analytics** is a whole separate tab; nothing surfaces opens/saves/shares/feedback at a glance.
- **Labels** across the flow: "Your apps" / "All apps" / "Apps" / "Maker · apps" / "Maker". Inconsistent.

### 1.8 Screenshots
Not captured: the maker pages are auth-gated, so headless capture needs a signed-in maker session, and the local app isn't running (needs `bun dev` + `db:migrate:local`). **Before/after screenshots to be captured during implementation** with a seeded maker account at 390 / 768 / 1440 (see Testing plan). Findings above are code-grounded with file:line.

---

## 2. Target IA

### 2.1 `/you` — compact Maker entry (replaces the inline 12-app grid)
```
Maker
{N} apps · {P} private
[ Manage apps ]   (primary → /maker/apps)
[ Ship app ]      (secondary → /new)
```
No inline app list on `/you`. (Keep the existing privacy/data copy below it.)

### 2.2 Maker shell (one clean shell, Dock/Tools/You-aligned)
- Header: **"Maker"** (no "shippie/maker" sub-brand duplication; brand/back-to-Dock affordance kept).
- Primary nav: **Apps** (default) · **Feedback** · **Ship app**. **No global Analytics or Settings tab** until there are real loaders with clear value — **app-level analytics lives inside app detail** [P2 review]. Empty top-level tabs are how the old-dashboard feeling creeps back; add them only when the page is real.
- Mobile: top bar + horizontal scrollable nav row; **no fixed sidebar**, no second stacked page header.

### 2.3 Apps list (row-based, scalable)
Each row: `icon · name · status/privacy pill · opens/views · last activity · [Open] [Share] [Manage]`.
- Desktop: full row. **Mobile: condense the three actions into one `⋯` menu.**
- Controls above the list: **search** (name/slug), **filter** (status, privacy), **sort** (recent · name · opens).
- **Scales:** server-side paginate (default 50) + "Load more" (or windowed list); search/sort run server-side for large accounts.
- **Status pills (human):** `success → Live`, `draft/none → Draft`, in-progress → `Updating`, failed → `Needs attention`. Privacy: `public → Public`, `private → Private`, `unlisted → Unlisted`.

### 2.4 App detail (simple)
- Title row: `icon · name · status pill` + actions **[Open] [Share] [Manage]**.
- **Single action vocabulary [P2 review]:** use **Manage** everywhere for the app backend; reserve **Profile** strictly for editing app metadata (name / tagline / theme). No "Edit" vs "Manage" split — don't create the next "Your apps / All apps / Apps" problem.
- Compact **metric strip**: opens · saves · shares · feedback · last event.
- Sections (fewer than 6 tabs): **Overview** (default) · **Feedback** · **Access** · **Profile** · **Deploys** (rename "Proof" to a clear label or fold into Overview/Deploys). Analytics shown compactly in Overview with "View details" one click deeper.

### 2.5 Share & analytics — visibility/status-aware
- Share = the **tool-drawer pattern** (`QrShareSheet`: copy link + QR), but **never share a misleading URL** [P1 review]:
  - **Public / unlisted + live:** copy + QR the public URL `https://<slug>.shippie.app/`.
  - **Private:** Share opens the **Access / invite flow**, NOT a public URL.
  - **Draft / no deploy / failed:** Share is **disabled** with a clear prompt — "Ship first" / "Fix deploy".
- Analytics simple by default (opens/saves/shares/feedback/last event); advanced detail behind one click.

---

## 3. Phased implementation

> Each phase ships independently and leaves the app working. Build phase-by-phase with review between.

### Phase 1 — Route & naming cleanup
**Scope:** Make `/maker/*` the canonical user-facing path and remove the 307-hop churn; unify labels; fix `return_to`.
- **Route ownership — LOCKED to Option A (review):** the real pages move `/dashboard/*` → `/maker/*`; `/dashboard/*` becomes a `308` compatibility alias → `/maker/*`. (Option B rejected — it keeps the old concept as the real architecture and the URL bar still flips.)
- **Maker layout must stop loading every app [P1 review].** Today `routes/dashboard/+layout.server.ts:40` loads ALL maker apps for the whole shell and `routes/dashboard/apps/+page.server.ts` just returns `layout.myApps` — so a 1000-app account is slow even with a paginated page UI. Slim the **layout load to user/auth + counts + 3–5 recent apps**; the **apps page owns its own paginated query** (the query is built in Phase 3, but the layout slim-down lands here so scaling is real, not cosmetic).
- **Repoint generated/emitted `/dashboard` URLs, not only visible UI links [P1 review]:** `routes/api/deploy/+server.ts:171`, `routes/api/deploy/trial/+server.ts:180`, `notify-maker.ts:130` (emails), `routes/dashboard/apps/[slug]/+page.svelte:28`, and `AppsTable.svelte:135` all emit `/dashboard` URLs.
- Unify the user-facing label to **"Apps"** inside a **"Maker"** area (drop "All apps"/"Your apps" as separate names). `/you` link label → "Manage apps".
- Fix `localContinueTarget`/intent so a `maker`-intent login lands back on the requested `/maker/...` page, not `/dock`.
- **Files likely touched:** `routes/maker/+page.server.ts`, `routes/maker/[...path]/+page.server.ts`, `routes/dashboard/**` (move to `/maker/**`), `routes/dashboard/+layout.server.ts` (slim load), `routes/dashboard/apps/+page.server.ts` (owns paginated query), `routes/dashboard/apps/[slug]/+layout.svelte` + `[slug]/+page.svelte:28` (hrefs), `lib/components/dashboard/Sidebar.svelte` + `AppsTable.svelte:135` (nav/links), `routes/you/+page.svelte`, `routes/auth/login/+page.server.ts`, `routes/api/deploy/+server.ts:171`, `routes/api/deploy/trial/+server.ts:180`, `notify-maker.ts:130`.
- **Risk:** High (route moves + redirect contracts + email/API URL emitters + deep-link compat).
- **Tests:** unit for `loginIntentFor`/`localContinueTarget` (maker returnTo → lands on maker); redirect tests for `/dashboard/* → /maker/*` (and legacy `/maker → real`); **provider-path return tests — email magic-link callback AND GitHub/Google OAuth callback both honour a `/maker/...` return** [P2 review] (the bounce can hide in token/OAuth callback plumbing, not just the login page render).
- **Browser checks:** logged-out `/maker/apps` → login (each provider) → lands on `/maker/apps`; `/dashboard/apps` 308 → `/maker/apps`; deep link `/dashboard/apps/<slug>/feedback` lands correctly.
- **Out of scope:** visual redesign (Phase 2+), list UI features (Phase 3).

### Phase 2 — Maker shell / header cleanup
**Scope:** Replace the legacy `Sidebar` with a Dock/Tools/You-aligned maker shell.
- New header "Maker" + nav row (**Apps default · Feedback · Ship app** — no empty Analytics/Settings tabs [P2 review]); mobile top bar + horizontal nav; remove the fixed paper rail and the second stacked page header; remove dev "Demo diagnostics" from the product surface (or gate behind admin).
- **Files:** `routes/dashboard/+layout.svelte` (→ `/maker` layout after Phase 1), `lib/components/dashboard/Sidebar.svelte` (replace/retire), a new `lib/components/maker/MakerShell.svelte` + `MakerTabs.svelte`, shared styles aligned to Dock/Tools/You tokens.
- **Risk:** Medium (layout/nav rework).
- **Tests:** component render test for tab active states; label regression test (header says "Maker", tabs match IA).
- **Browser checks:** 390/768/1440 — single header, no duplicate chrome, tabs reachable, back-to-Dock works.
- **Out of scope:** row/list internals (Phase 3); detail (Phase 4).

### Phase 3 — Scalable apps list
**Scope:** Row component + search/filter/sort + pagination + human status/privacy pills + quick actions + empty/large states.
- Add list controls (search/filter/sort) wired to the loader; paginate (default 50 + "Load more" or windowing); `AppRow.svelte` with icon/name/status/privacy/opens/last-activity + `[Open][Share][Manage]` (mobile `⋯`); human status/privacy mapping helper; cleaned empty state.
- **Files:** `routes/dashboard/apps/+page.svelte` (→ maker apps page), `+page.server.ts` (search/sort/paginate params + counts), new `lib/components/maker/AppRow.svelte`, `lib/components/maker/AppListControls.svelte`, a status/label mapping util in `lib/`.
- **Risk:** Medium (loader pagination/perf; mobile row layout).
- **Tests:** util tests for status/privacy label mapping; loader test for search/sort/paginate (filters correct subset, stable order); empty-state + >50-app pagination test.
- **Browser checks:** 1 app, 0 apps, ~100 apps (seed) at 390/768/1440 — rows don't overflow, actions reachable, search/sort work, "Load more" works.
- **Out of scope:** detail page (Phase 4); share sheet internals (Phase 5, but wire the button here).

### Phase 4 — App detail simplification
**Scope:** Title row (name + status + **Open / Share / Manage** — single vocabulary [P2 review]), compact metric strip, fewer/clearer sections.
- Collapse 6 tabs → Overview (default, with compact analytics) · Feedback · Access · Profile · Deploys (rename/retire "Proof"); add metric strip; remove redundant breadcrumb eyebrow.
- **Files:** `routes/dashboard/apps/[slug]/+layout.svelte`, `.../[slug]/+page.svelte` (Overview), tab subroutes (`feedback/analytics/access/profile/proof`), new `lib/components/maker/MetricStrip.svelte`.
- **Risk:** Medium (consolidating routes/tabs; preserve deep links to subpages).
- **Tests:** layout renders correct tabs + active states; metric strip renders with zero/empty data; deep-link to each subpage still resolves.
- **Browser checks:** detail at 390/768/1440 — title actions don't wrap, metric strip readable, each section opens.
- **Out of scope:** advanced analytics dashboards (later); share sheet (Phase 5).

### Phase 5 — Share & analytics cleanup
**Scope:** Tool-drawer share pattern + simple-by-default analytics.
- Wire `[Share]` (list + detail) to the existing `QrShareSheet`, **branching on visibility/status per §2.5** [P1 review]: public/unlisted+live → copy + QR public URL; **private → Access/invite flow (no public URL); draft/no-deploy/failed → disabled with "Ship first"/"Fix deploy"**. Make Overview analytics = opens/saves/shares/feedback/last event with a "View details" link to the full Analytics view.
- **Files:** `lib/components/maker/ShareButton.svelte` (wraps `QrShareSheet` from `@shippie/showcase-kit-v2`; takes visibility+status), the Access/invite surface it links to, `routes/.../[slug]/+page.svelte` (Overview metrics), `.../analytics/+page.svelte` (advanced).
- **Risk:** Low-Medium (reuse existing share component; the matrix logic is the new part).
- **Tests:** **the full share matrix** — public/live → public URL copied + QR; private → opens invite (no public URL); draft/failed → disabled with the right prompt; analytics summary renders with empty data.
- **Browser checks:** share from list row and from detail at 390/1440; copy + QR present.
- **Out of scope:** new analytics pipelines/metrics not already collected.

### Phase 6 — Mobile polish & regression tests
**Scope:** Final 390px pass + automated guards.
- Spacing/touch-target/action-menu polish; ensure no wrap/overflow; add the route/label regression + a maker-flow Playwright smoke.
- **Files:** maker components' styles; `apps/platform/scripts/maker-smoke.mjs` (new, sibling to `pwa-smoke.mjs`); label/redirect unit tests.
- **Risk:** Low.
- **Tests:** Playwright maker-flow smoke (see Testing plan); label regression (no "All apps"/"Your apps"/old "Data" leakage in maker).
- **Browser checks:** full flow 3× mobile + 3× desktop (below).
- **Out of scope:** none — this closes the effort.

---

## 4. Migration / compatibility
- Per the **locked Option A** (Phase 1): real pages live at `/maker/*`; keep **`/dashboard/*` working as `308` aliases to `/maker/*`** — preserve all deep links incl. `[slug]` subpages (`/feedback`, `/analytics`, `/access`, `/profile`, `/proof`), and query strings.
- Preserve existing `?return_to` contracts; only change where a maker-intent login *lands* (back on the maker page).
- No D1 schema change expected (reuse existing app/owner/deploy/analytics tables); if pagination needs an index, add a forward-only migration (next free number per `check-migrations`).

## 5. Empty-state & large-account behaviour
- **Zero apps:** clean empty state — "Ship or claim your first app" + `[Ship app]`; remove the dev "Demo diagnostics" block from the product surface (admin-only if kept).
- **1–50 apps:** single page, no pager.
- **50–1000+ apps:** server-side search/sort + pagination ("Load more" or windowed); counts (Total/Live/Private) computed server-side, not from a full client array; never render thousands of DOM rows at once.

## 6. Acceptance criteria
- From `/you`, the Maker entry is a compact block (Maker · count · Manage apps · Ship app) with **no inline app list**.
- The maker area shows **one clean shell** (header "Maker" + **Apps/Feedback/Ship app** nav — no empty Analytics/Settings tabs), Dock/Tools/You-aligned, **no duplicate chrome** and **no second stacked header on mobile**.
- The apps list is **row-based**, has **search + filter + sort**, **human status/privacy pills**, at-a-glance metrics, **Open/Share/Manage** (mobile `⋯`), and **paginates** (verified with ~100 seeded apps).
- App detail has a **title row with Open/Share/Manage** (single action vocabulary; Profile = metadata editing only), a **compact metric strip**, and **≤5 clear sections**.
- **Share is visibility/status-aware:** public/unlisted+live → copy + QR the public URL; private → opens Access/invite flow (no public URL); draft/no-deploy/failed → disabled with "Ship first"/"Fix deploy".
- **No first-party generated or user-visible `/dashboard` URLs remain** (emails, API responses, components) except the redirect aliases / tests / comments — grep-checked.
- **The maker layout load no longer fetches the full app list** — it loads only user/auth + counts + 3–5 recents; the apps page owns the paginated query (verified the layout query doesn't grow with app count).
- Logged-out `/maker/apps` → login → **lands back on `/maker/apps`** for **email magic-link AND GitHub/Google OAuth** return paths.
- Labels are consistent ("Maker" area, "Apps"); no "All apps"/"Your apps"/old "Data" leakage.
- `bun run health` green; maker smoke + label/redirect tests pass; no overflow/wrap at 390/768/1440.

## 7. Testing plan
- **Code:** `bun run check`; relevant vitest (login intent, redirects, label/status mapping, loader pagination); `bun run health` before any deploy (note the cache-cold showcase-test gotcha — both demos now have smoke tests).
- **Route smoke:** `/you`, `/maker/apps`, `/dashboard/apps` (→alias), `/maker/apps/<slug>` (+ each subpage), `/new` — assert correct render/redirect and not-blank.
- **Browser flow ×3 (desktop 1440 + mobile 390):** `/you` → Maker/Manage apps → app detail → Share → back; and unauthenticated `/maker/apps` → login → return to `/maker/apps`.
- **Before/after screenshots** at 390/768/1440 using a seeded maker account.

## Self-review notes
- Spec coverage: entry path ✓(§1.1/§2.1), all maker routes ✓(§1.2/Phase 1), detail flow ✓(§1.4/Phase 4), responsive ✓(§3 browser checks/Phase 6), all "what to look for" items mapped to findings (duplicate chrome §1.5, labels §1.7, route ownership §1.2, scaling/search §1.3, share §1.7, status labels §1.3, return_to §1.6, empty/large §5), IA proposal ✓(§2), phased plan w/ files+risk+tests+browser+out-of-scope ✓(§3), migration ✓(§4), acceptance ✓(§6), testing ✓(§7).
- Route-ownership decision **LOCKED to Option A** (real pages at `/maker/*`, `/dashboard/*` → 308 alias) per reviewer.
- Reviewer's six approval conditions patched in: (1) maker layout stops loading every app [Phase 1/§2.2], (2) generated `/dashboard` URL emitters repointed + acceptance grep [Phase 1/§6], (3) visibility/status-aware share matrix [§2.5/Phase 5], (4) no empty top-level tabs — Apps/Feedback/Ship app only [§2.2/Phase 2], (5) provider-path login return tests [Phase 1/§6], (6) single action vocabulary — Manage everywhere, Profile = metadata [§2.4].
- No implementation performed (per instruction).
