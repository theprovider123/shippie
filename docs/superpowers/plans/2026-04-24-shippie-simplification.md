# Shippie Simplification Plan

> **Goal:** One real user can deploy Palate, share the URL, and install it as a PWA without a single maker-facing leak on the public page.

**Refined from launching Palate end-to-end on 2026-04-24.** Evidence screenshots: `/tmp/shippie-shots/palate-marketplace.png`, `/tmp/shippie-shots/palate-app-{desktop,mobile}.png`.

---

## What the Palate launch proved

- **The core pipeline works.** Zip → deploy → live at `{slug}.shippie.app` in 47ms. Proxy injects SDK/manifest invisibly. Expo web export runs perfectly.
- **The app detail page is the bottleneck.** Everything that looked unfinished is on `/apps/[slug]`, not in the runtime. The work is scoped to one page + one API response shape.
- **Seed data is the second-biggest tell.** "V2", "5/5 compatibility", bundler-leaked external domains — all read as "we don't know what to put here."

---

## Phase 0 — App detail page honesty pass (Palate-grounded)

Each cut is driven by something visible on the screenshot.

**Status (2026-04-24):** 0.2, 0.3, 0.4, 0.5, 0.6 **shipped**. 0.1 **partial** — monogram fallback shipped; manifest-aware icon extraction deferred (Expo-style bundles don't expose icons at root, needs a deeper parser).


### 0.1 Extract and render the app icon
**Observed:** Blank orange square next to "Palate" hero.
**Reason:** `apps.icon_url` is null; manifest.json in the upload is parsed but we never pull icons.
**Files:** `apps/web/lib/deploy/zip.ts` (parse manifest on upload), `packages/db` (already has column? check), `apps/web/app/apps/[slug]/page.tsx` (render).
**Fallback:** derived initial on brand gradient (what's already there, but *only* if no icon — and log-out so we notice).

### 0.2 Strip deploy version from public hero
**Observed:** "APP · TOOLS · V2" in the hero strip.
**Reason:** `version` is an internal counter, not product info.
**Fix:** Remove the `· v{version}` segment from `apps/web/app/apps/[slug]/page.tsx`. Keep kind + category. Version stays visible in `/dashboard/apps/[slug]`.

### 0.3 Hide maker preflight warnings from public page
**Observed:** "Analytics events is declared but not used in code — consider removing from shippie.json" is on the public `/apps/palate` page.
**Reason:** Preflight findings are for the developer, not visitors. Leaking them makes the app look broken.
**Fix:** Move preflight results to `/dashboard/apps/[slug]`. Public page gets preflight *pass/fail* only (or nothing).

### 0.4 Kill the fabricated compatibility score
**Observed:** "5/5 ★★★★★" with no real source.
**Reason:** Seed data from early UI work. No truth behind the number.
**Fix:** Remove the Compatibility block entirely from the public page for now. (Can come back later as real install/rating data — see `packages/db` ratings tables we already have.)

### 0.5 Curate external domains
**Observed:** "⚠ expo.fyi (js), ⚠ docs.expo.dev (js)" — these are dead links inside Expo's bundled code, not functional dependencies.
**Reason:** The extractor pulls every URL it finds in JS strings. For bundler-processed apps this is 90% noise.
**Fix options:**
  - (a) Hide the External domains block on public page entirely — move to maker dashboard.
  - (b) Only show domains that the app actually fetches at runtime (CSP report-only mode via `services/worker`).
**Recommend (a) now, (b) later.** (a) is a delete; (b) is a week.

### 0.6 Simplify permissions display
**Observed:** Two-column list with mix of `—` (dash) and `✓` (check). No user can tell what "Sign in — / Analytics ✓" means.
**Reason:** The dash = "declared, not used"; the check = "declared and used". This is preflight output dressed as a permissions UI.
**Fix:** Show only permissions the app actually requests, as a plain flat list with clear labels ("Can sign you in", "Can send notifications"). Remove the dash/check duality.

---

## Phase 1 — Flow simplification

**Status (2026-04-24):** 1.1, 1.2, 1.4 **shipped**. 1.3 **no-op** — nav was already clean on audit.

### 1.1 Rewrite `/new` as a 3-option picker
**Current state:** `/new` already has zip + wrap forms. Both are live but crammed.
**Fix:** Top of `/new` = three cards — "Upload a zip", "Wrap a hosted URL", "Connect a repo (GitHub)" — each links to a clean sub-route or reveals its form. The picker is the whole page until the user chooses.

### 1.2 Success state on `/new` after deploy
**Current:** After upload, user gets pushed back to dashboard. No install funnel triggered.
**Fix:** `/new` success renders: live URL, QR code (qrcode.js), "Install on phone" button, link to `/apps/[slug]`.

### 1.3 Dashboard nav cleanup
**Hide from primary nav until shipped:** orgs, custom domains, functions, monitoring.
**Keep:** My apps, New, Docs, Account.

### 1.4 Delete or merge `/deploy`
**Current:** `/deploy` exists as a legacy page; `/new` is the real entry. Check for callers and delete if none.

---

## Phase 2 — Install funnel polish

### 2.1 Install banner on app detail page
**Observed:** `Install Palate` button with white outline is the only install affordance — no instructions, no iOS-specific path.
**Fix:** On first visit, show install banner (already exists — `pwa-install-banner.tsx`) scoped per-app. On iOS Safari, walk through "Share → Add to Home Screen". We have this flow built for Shippie itself; port it per-app.

### 2.2 Manifest fidelity
**Observed:** The wrapped manifest inherits Shippie's name in some places. Verify each installed app gets its own manifest with `short_name`, `icons`, `theme_color` from the original.
**Files:** `services/worker/src/rewriter.ts` injectPwaTags, `services/worker/src/manifest.ts`.

---

## Phase 3 — Truth in data

**Status (2026-04-24):** 3.1 **shipped in worktree** — `/leaderboards` reads real rollups/ratings/public apps. 3.2 **shipped in worktree** — rate/ratings PGlite handles now close cleanly; combined test run exits `0`.

### 3.1 Replace seed leaderboards
**Current:** `/leaderboards` is populated with hand-crafted seed. Harmless on day 1, embarrassing on day 30.
**Fix:** Drive from real `app_installs`, `app_ratings`, `app_events` tables. Empty state = "No apps yet — [launch the first one →]".

### 3.2 Fix pre-existing rate-route test mock-pollution
**Context:** 2 tests in `apps/web/app/api/...rate...test.ts` fail when the suite runs together. Isolated runs pass. Known pre-existing issue.
**Fix:** Isolate the mock registry per test file (use `mock.restore()` in afterEach) or move to separate test group.

---

## Execution notes

- **Order matters:** Phase 0.1–0.6 are cosmetic but unblock sharing Palate with a real user. Do these first.
- **Each 0.x is committable independently.** Small PRs, no cross-file sprawl.
- **Don't touch the runtime.** The proxy/rewriter work — leave it alone.
- **Don't add new features.** Every phase removes or re-homes existing UI. No new routes, no new tables.
- **User flow checkpoint after Phase 0:** re-screenshot `/apps/palate` and compare. If the page reads as "this is a finished app", Phase 0 is done.

---

## Out of scope (deferred)

- Custom domains per app
- Orgs/teams
- Monetization, billing
- Cloud functions for wrapped apps
- Email-invite variant of the invite system (Phase C from URL-wrap work)
- Rate-limit tuning
