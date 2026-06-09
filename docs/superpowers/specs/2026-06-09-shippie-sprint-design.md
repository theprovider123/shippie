# Shippie Sprint — Design Spec
_2026-06-09_

Visual decisions agreed in brainstorm session. Eleven areas grouped into five implementation tracks.

---

## Track 1 — Offline UX

### 1a. Offline indicator (Dock / Tools drawer)

**Agreed direction:** Amber pill + per-app sub-labels (option D).

When `navigator.onLine === false`:
- Amber "offline" pill appears next to the drawer section heading (Dock, Tools).
- Each app row/card shows a sub-label:
  - `● ready offline` (amber) — `offlineState === 'ready'`
  - `● not saved` (very dim, grey) — not cached
- Existing grey `dot-offline` dot on the swatch is **removed** — sub-label replaces it.
- When the device comes back online the pill disappears, sub-labels revert to normal.

**Implementation surface:**
- New store: `src/lib/stores/network-status.ts` — exports a `$isOnline` readable that subscribes to `window.addEventListener('online'/'offline')` and seeds from `navigator.onLine`.
- `ToolRow.svelte` + `ToolCard.svelte`: consume `$isOnline`, render the sub-label below the app name when offline, replace the dot.
- `+layout.svelte` or the dock shell: render the amber pill in the section heading when offline.
- CSS: amber = `var(--amber, #f5a623)`, pill style consistent with other status pills in the design language.

### 1b. Broader offline experience improvements

- **"Save for offline" CTA more prominent on mobile:** when an app is in Dock but not yet cached (`offlineState !== 'ready'`), show a nudge banner inside the open app or in the drawer row on first use.
- **Unavailable app in Dock when offline:** if user taps an uncached app while offline, show a friendly overlay inside the iframe shell: "This app needs a connection — save it offline to use it anywhere."
- **Auto-cache on Dock add:** when a user adds an app to Dock, immediately kick off `ensureAppOffline()` in the background rather than waiting for the user to manually save.
- **Graceful update when back online:** when `isOnline` flips back to `true`, silently refresh stale cached apps that have `offlineState === 'needs-refresh'`.

---

## Track 2 — Maker management

### 2a. Simplify maker home + app list

Current state: app rows on `/maker` and `/maker/apps` show a status pill, a visibility text label, and a "Manage" link. Getting to settings requires navigating into the detail page.

**Changes:**
- Visibility label becomes an inline `<select>` dropdown on every app row (both `/maker` home and `/maker/apps`). Same options as `VisibilityPicker`. On change: fires `PATCH /api/apps/[slug]/visibility` optimistically, shows a brief "Saved" toast. Uses the same `onChange` logic already in `VisibilityPicker`.
- Add a "Quick actions" kebab (⋮) on each row with: Open, Share, Edit identity, Archive. Replaces the current scattered action links.
- `/maker` home: increase the recent apps list from 6 to 8 rows. Drop the "View all →" link text to an icon-only arrow.
- Summary grid on `/maker` home: add a "Drafts" count alongside Total / Live / Private.

### 2b. App identity update (name, slug, icon)

**Agreed direction:** Focused modal triggered from anywhere.

**Trigger points:**
- Clicking the app icon/swatch on the detail page header.
- "Edit identity" in the kebab menu on any app row.

**Modal contents:**
1. **Name** — text input, `maxlength=64`.
2. **Slug** — text input, auto-populated from name (kebab-cased), editable. On blur: async `GET /api/apps/slug-check?slug=X&exclude=currentSlug` — shows ✓ available / ✗ taken.
3. **Slug change warning** — if slug differs from current: amber inline banner: _"Old URL (currentSlug.shippie.app) will redirect for 30 days. Saved links and share cards will update automatically."_
4. **Icon type tabs:** `🎨 Colour` | `😀 Emoji` | `🖼 Upload`
   - **Colour:** 8 preset swatches + `<input type="color">` for custom. Updates the `themeColor` field + monogram background.
   - **Emoji:** Grid of 36 common emoji (categorised: sport, food, nature, objects, symbols). Tapping one sets `iconEmoji`; the monogram is replaced with the emoji at full size.
   - **Upload:** Drop zone or file picker. Accepts PNG/JPG/WebP/SVG ≤ 1MB. Uploads to R2 via `POST /api/apps/[slug]/icon` → stores as `iconUrl`. Shows preview.
5. **Remix lineage** (read-only, shown only when applicable): _"Forked from [original app name]"_ — links to the source app.
6. **Save button** — single `PATCH /api/apps/[slug]/identity` call with `{ name, slug, themeColor?, iconEmoji?, iconUrl? }`.

**Backend — new endpoint `PATCH /api/apps/[slug]/identity`:**
- Validates name (non-empty), slug (kebab, unique excluding self).
- If slug changed: inserts a row into `app_slug_redirects` table (`old_slug`, `new_slug`, `expires_at = now + 30 days`). New migration required.
- Updates `apps` row: `name`, `slug`, `themeColor`, `iconEmoji`, `iconUrl`.
- Patches KV `apps:{slug}:meta` with new name + icon fields.
- If slug changed: writes `apps:{oldSlug}:redirect = newSlug` to KV (TTL 30 days) so the Worker can serve a 301 immediately.
- Busts OG image cache (delete `apps:{slug}:og-image` from KV if present).

**Backend — icon upload `POST /api/apps/[slug]/icon`:**
- Validates ownership, file type, size.
- Uploads to R2 under `icons/{slug}/{hash}.{ext}`.
- Returns `{ iconUrl }`.

### 2c. Auto-save encouragement

- `VisibilityPicker` already auto-saves on radio change — no change needed here.
- Inline visibility dropdown (2a) auto-saves identically.
- App identity modal: icon/colour/emoji selection auto-previews live; final save requires the explicit "Save" button (slug validation needs a confirm step).
- Where forms currently have an explicit "Save" button that is the only affordance, add a subtle "Changes saved" flash after successful auto-saves rather than requiring the button.

---

## Track 3 — Platform bugs

### 3a. Visibility toggle not going live (P0 bug)

**Root cause:** `PATCH /api/apps/[slug]/visibility` calls `setAppVisibility({ cache: env.CACHE ?? null })`. When `env.CACHE` is `null` (KV binding missing or unavailable in the platform SvelteKit route context), the function updates D1 but skips KV sync (`metadataSynced: false`). The Worker's access-gate reads **only** from KV (`apps:{slug}:meta`), so it never sees the D1 change.

**Fix:**
- In the visibility PATCH route, if `result.metadataSynced === false`: attempt a direct KV write as a fallback via a reconcile step, OR surface a clear error to the client ("Visibility saved locally but not yet live — try again").
- Check why `env.CACHE` is null on the platform routes. The `CACHE` KV namespace binding must be declared in `wrangler.toml` for the platform worker and in local dev config. Audit `wrangler.toml` for the `[vars]` / `[[kv_namespaces]]` declaration.
- Add a `metadataSynced: false` warning toast in `VisibilityPicker.svelte` when the API response includes `metadata_synced: false`.
- Add a cron/reconcile job that periodically re-syncs `visibility_scope` from D1 → KV for any apps where they diverge (safety net).

### 3b. PWA readiness

Known manifest gaps (against current Lighthouse PWA checklist and Chrome install heuristics):
- **`screenshots` field missing** — required for the "enhanced" install UI on Android/Chrome. Add at least 2 screenshots (wide + narrow) showing the dock/tools views.
- **`description` field** — present but not localised; add `description_localized` map.
- **No `prefer_related_applications: false`** — Chrome may defer to Play Store without this.
- **Service worker offline fallback** — the branded offline page is generated in the SW, but Lighthouse checks for a `200` response to `/` when offline. Confirm the SW intercepts `/` and `/dock` correctly.
- **Maskable icon** — `icon-512-maskable.png` exists in manifest but confirm safe zone is correct (content within the inner 80% circle).
- **Install prompt not surfaced** — consider adding a subtle "Add to home screen" nudge banner on first visit on mobile, dismissible, stored in `localStorage`.

Full Lighthouse audit should be run after deploy to get precise failure list.

---

## Track 4 — Sharing & OG

### 4a. App share link / OG cleanup

**Current:** `<title>{app.name} — Shippie</title>`, `og:title` same. Generic Shippie description fallback.

**Target:** App-first — the shared link should feel like the app's own card, not a Shippie page.

**Changes to `apps/[slug]/+page.svelte` `<svelte:head>`:**
```html
<title>{app.name}</title>
<meta property="og:title" content={app.name} />
<meta property="og:description" content={app.tagline ?? app.description ?? ''} />
<meta property="og:image" content={ogImageUrl} />  <!-- see below -->
<meta property="og:site_name" content="Shippie" />  <!-- keep brand but secondary -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content={app.name} />
<meta name="twitter:description" content={app.tagline ?? ''} />
```

**OG image generation** — server-side at `GET /api/golazo/og` already exists as a pattern. Build a general `GET /api/apps/[slug]/og-image` that returns a `200×200` PNG (or `1200×630` for large card):
- App icon centred (emoji / upload / monogram).
- App `themeColor` as background.
- App name in white below the icon.
- Dimensions: `1200×630` (standard OG large card). Twitter card type: `summary_large_image`.
- Cached in KV (`apps:{slug}:og-image`) with 1-hour TTL. Busted on identity update.

Also fix the `/run/[slug]` route which currently shows Shippie branding — apply same head tags.

---

## Track 5 — App experiences

### 5a. Coffee app (lot.) — mobile performance + background

**Performance fixes (jitter):**
- Audit component re-render frequency. The `store` object in `App.tsx` uses a monolithic `useState<Store>` — every brew/bag update re-renders the entire tree. Split into granular stores or use `useMemo` for derived values (`bagsByStatus`, `brewsForBag`, etc.).
- Screen transitions use CSS animation (`fadeSlideIn`, `slideUpFadeIn`) — add `will-change: transform` and ensure they run on the compositor. Remove `transition: opacity` on `button:active` which causes layout recalculation on tap.
- Sheet components (`SwitchBagSheet`, `AddBagSheet`) — ensure they use `transform: translateY()` not `top` for slide-in animation.
- Disable the paper grain `body::before` on low-power devices: `@media (prefers-reduced-motion: reduce) { body::before { display: none; } }`.
- Viewport height: use `100dvh` everywhere, not `100vh`, to avoid iOS Safari address-bar jitter.

**Background treatment (agreed: C — bold liquid splash):**
- Add two SVG splash illustrations: one large (anchored bottom-right, ~45vw wide), one small (top-left, ~20vw).
- Espresso colour: `#6b3a14`, opacity `0.10–0.13` so they read as atmosphere not foreground.
- Rendered as `position: fixed; pointer-events: none; z-index: 0` behind all content.
- SVG paths defined inline in a `CoffeeSplash` component — no external fetch.
- Animate very slowly on mount: `opacity 0 → 0.12` over 1.2s, `transform: scale(0.97) → 1` — enters as the app loads.

### 5b. Golazo — penalty & free kick overhaul

**Agreed visual direction:** First-person view, goal fills ~92% screen width, keeper is ~44% of goal height (small relative to the goal — placement matters far more than keeper guessing).

**Keeper changes:**
- Render using the detailed anatomy from the prototype: head with eyes/hair/cap, torso with jersey number, proportionate arms, gloves with wristband, legs with boots and shin pads.
- Replace `drawKeeper()` in `stadium.ts` with the new implementation. Keep the same `Keeper` class API.
- Pre-shot tell: keeper subtly drifts toward their preferred dive side in the 1–2 seconds before the player shoots. Drift amount = `0.08 * goalWidth`, speed = `0.032` lerp per frame. Occasionally fakes (30% chance: drifts one way then snaps back).
- Post-save celebration: keeper raises both arms (arms animate to `dive=1.0` + `lean=0` briefly) with a "SAVED!" flash.

**Goal size:**
- Increase goal width from current `W * 0.14→0.86` (72%) to `W * 0.04→0.96` (92%) for penalty and free kick.
- Increase goal height from `H * 0.23` to `H * 0.34` (taller = more top-corner opportunity).
- Update `zoneX()` calculations and all geometry that references the old goal bounds.

**Precision placement mechanic (from prototype):**
- Replace zone-tap (Left/Middle/Right) with swipe gesture:
  - **Direction** of swipe = placement (inverted: swipe left → ball goes right).
  - **Horizontal component** = curl (bend amount).
  - **Speed/distance** = power (affects keeper reaction time and shot height).
  - Small randomness: `±W*0.016 * power` horizontal, `±H*0.014 * power` vertical — enough to punish sloppy swipes, not enough to cancel precise ones.
- Show aim guide arc (dashed) during drag, target reticle at destination, power bar at bottom, curl indicator if horizontal drag exceeds 14% of screen width.
- On release: keeper commits based on predicted target + `±22% of goal width` error.

**Free kick specific:**
- Wall: 1–3 defenders in a line. Wall position converges toward spot as rounds increase (existing logic, keep).
- Curl mechanic: horizontal drag component curves the ball around or over the wall.
- On high power + upward trajectory: ball can go over wall even without curl.

**Mind games (keeper):**
- Before each shot, keeper randomly performs one of: step left, step right, wave arms (psyche-out — arms briefly raise), or stay neutral.
- Psyche-out frequency: 40% of shots.
- Feint: 30% of the time when they step, they snap back to centre before diving the other way.

**Mobile UX:**
- Swipe zone expanded — any touch below `H * 0.7` counts as ball interaction (player doesn't need to start drag exactly on the ball).
- Haptic feedback on goal (existing `celebrate()`) and save (`confirmBuzz()`).
- Touch targets for UI buttons (mute, mode) minimum 44px.

---

## Track 6 — App update flows

### 6a. Update UX

**Current state:** When a new version is deployed, the SW shows a "New version available" notification. The UX after that point is underspecified.

**Desired flow:**
1. SW detects new version → dispatches `shippie:update-available` message to all clients.
2. Dock shows an "Updates" indicator (existing `Updates box`) — works.
3. Tapping "Update" on a Dock app: closes the old iframe, clears the stale offline capsule, re-fetches the new version, re-opens. Show a brief "Updating…" spinner in place of the app.
4. "Update all" option in the Updates box that sequences all pending updates.
5. Auto-update on next cold launch: if the app has been closed for >1 hour and an update is pending, apply it silently on next open.

---

## Migration requirements

| # | Migration | Purpose |
|---|-----------|---------|
| 1 | `app_slug_redirects` table | `old_slug`, `new_slug`, `expires_at` — powers 301s on slug rename |
| 2 | `icon_emoji` column on `apps` | Stores emoji icon choice |
| 3 | KV key `apps:{slug}:redirect` | TTL-based redirect for renamed slugs (no migration, runtime write) |

---

## Out of scope

- Deep data-hub unification (deferred per existing memory).
- Wonde/SSO switch-ons for Uniti.
- New app categories or taxonomy changes.
