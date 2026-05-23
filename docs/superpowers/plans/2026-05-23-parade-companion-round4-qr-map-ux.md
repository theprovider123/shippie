# Parade Companion — Round 4: QR fix · Map detail · UI tightening · Inbox / Memories / Wrap-up

> Companion to the round-3 live-group plan. Built on commits up to `c478581f`.
> Date: 2026-05-23. Parade: 2026-05-31 — **8 days out.**
> Baseline: typecheck clean · 25/25 tests · build OK · nav is now 3 tabs (Map · Group · Safety).

---

## 1. The QR bug — root cause + fix (P0)

### Reproduction
1. User creates a plan → taps **Share QR**.
2. The generated URL is `https://shippie.app/run/parade-companion/#<fragment>`.
3. Friend opens the camera → scans → URL opens.
4. The app does **nothing** — no import banner, no plan applied.

### Root cause — confirmed by reading the code

Platform `apps/platform/src/lib/container/AppFrameHost.svelte` embeds each showcase with
`<iframe src={runtimeSrc} ...>`. `runtimeSrc` is `/__shippie-run/<slug>/`. **The parent URL's
`#<fragment>` is never appended to the iframe's `src`.** So inside the iframe,
`window.location.hash` is empty; `App.tsx`'s `handleHash` reads it on mount, finds nothing, and
returns early. `decodePlan` / `decodeFanEventsSync` are never called.

Secondary contributing factor (not the root cause, but worth fixing): the QR payload is the **full
URL**, up to `~1400 chars` for a typical plan. At ECC `'M'` that's a dense ~Version-30+ QR that's
hard to scan on a printed sticker in sunlight on a small phone.

### Fix — three layers, ship all three

**Layer A — Platform (the real fix):** forward the parent URL's hash into the iframe `src`, and
push subsequent `hashchange` events into the iframe.

```svelte
<!-- AppFrameHost.svelte -->
<script lang="ts">
  // ...existing imports
  const initialHash = typeof window !== 'undefined' ? window.location.hash : '';
  const srcWithHash = $derived(initialHash ? `${runtimeSrc}${initialHash}` : runtimeSrc);

  // Push later hash changes via postMessage so we don't remount the iframe.
  $effect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      iframeRef?.contentWindow?.postMessage(
        { kind: 'shippie.parent-hash', hash: window.location.hash },
        window.location.origin,
      );
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  });
</script>

<iframe ... src={srcWithHash} ...></iframe>
```

This is a one-file, ~10-line change that fixes hash-based sharing for **every** showcase, not just
parade.

**Layer B — App fallback** (defensive; small change in `App.tsx`):

```ts
function readShareHash(): string {
  const own = window.location.hash;
  if (own && own.length > 1) return own.slice(1);
  try {
    // Same-origin parent? Read theirs.
    const parentHash = window.parent !== window ? window.parent.location.hash : '';
    if (parentHash && parentHash.length > 1) return parentHash.slice(1);
  } catch {
    // Cross-origin parent (shouldn't happen in our setup, but be safe).
  }
  return '';
}
```

Also listen for the platform's `postMessage`:

```ts
useEffect(() => {
  const onMessage = (e: MessageEvent) => {
    if (e.origin !== window.location.origin) return;
    if (e.data?.kind === 'shippie.parent-hash' && typeof e.data.hash === 'string') {
      // Trigger the same import flow with the new hash.
      handleHash(e.data.hash);
    }
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}, []);
```

**Layer C — Shrink the QR payload** so the printed sticker scans first time.

- Encode the QR with a **short alias URL**: register a platform redirect `https://shippie.app/p#<frag>` → `https://shippie.app/run/parade-companion/#<frag>`. Saves ~20 chars per QR (small, but lower module density helps).
- Show the **6-character room code** as text under the QR (mono caps, large). Receivers who can't scan the QR (sunlight, dirty camera, sticker glare) type the code at `shippie.app/p` and pick the room. (Codex: this requires a small platform endpoint that resolves the code → fragment. Until that exists, the URL fallback in the QR sheet is the get-out.)

### Verification cases (no browser-automation here; codex's manual test)
- Scan QR from iOS Safari camera while app is in foreground on receiver. → import banner.
- Scan QR while the app isn't running on the receiver. → app loads, import fires after first paint.
- Scan QR on the receiver who has Added to Home Screen. → same.
- Scan QR on a receiver with NO prior cache + offline. → URL fails to load (expected, document this in the QR sheet copy — already done).
- Re-share the URL by SMS / link copy. → same import.

---

## 2. Map detail — stylized vector overlay (P0, no PMTiles needed)

### Current state

`public/basemap/corridor.webp` is a static raster + `CorridorMap.tsx` draws the route, GPS dot, and
fan-event clusters on top. The basemap shows generic detail that wasn't restyled to the brand;
pinch-zoom is just bitmap scaling. Section 0 cuts the PMTiles + MapLibre upgrade.

### The win without PMTiles — bake a small GeoJSON pack into the route pack

Use [Overpass](https://overpass-api.de) to extract a small slice of central Islington (the
corridor's bounding box), simplify with [mapshaper](https://mapshaper.org), and ship as
~30–80 KB of GeoJSON inside `runtime_assets`. `CorridorMap` draws the features on Canvas in the
design palette beneath the route.

What to include:

| Layer | OSM filter | Render |
|---|---|---|
| Major streets | `highway=primary|secondary|tertiary|trunk|residential` | Hairline ink stroke; thicker at low zoom; names mono caps at zoom ≥ 1.8 |
| Tube + Overground stations | `railway=station; station=subway|light_rail` | Sharp red dot + `✓`/`✗` from `pack.transport.stations` status |
| Named pubs + landmarks | `amenity=pub` or `historic=*` (curated by hand) | Small gold pin + label at zoom ≥ 1.5 |
| Parks + open spaces | `leisure=park`, `landuse=grass` | Faint sage fill |
| Buildings (sparse) | `building=*` filtered to the corridor | Very-faint ink stroke at zoom ≥ 2.5 only |
| Road closures + first-aid + exits | from `pack.closures`, `pack.pois` | Already drawn; sit on top |

### Why this beats PMTiles **for this app**

- **~30 KB** vs 5–15 MB for the equivalent PMTiles file.
- **Re-styleable in our brand** (paper, ink, red, sage, gold) — PMTiles vectors give you generic OSM colours unless you write a full Mapbox style spec.
- **Zero new dependencies** — no MapLibre, no WebGL setup, no iOS Safari edge cases.
- **Matches the original Claude Design intent** (stylized programme-feel, not a Google clone).
- **Survives Section 0**'s cut.

### Implementation

1. Run the Overpass query once for the corridor bbox (≈ `-0.125, 51.531, -0.085, 51.566`).
2. `mapshaper` → simplify polygons to ≤ 0.3 mm precision; drop all tags except `name`, `kind`,
   `station_code`.
3. Bake into `public/basemap-features.json` declared in `shippie.json#runtime_assets`.
4. New types in `data/parade-2026.ts`: `BasemapFeatures { streets[], stations[], landmarks[], parks[], buildings[] }`.
5. `route-pack.ts` loads it (with the existing cache-first pattern) and exposes via the pack.
6. `CorridorMap.tsx` adds `drawStreets`, `drawParks`, `drawStations`, `drawLandmarks`, `drawBuildings`. Ordered: parks → buildings → streets → POIs → route → fan events → GPS dot.

### Cheap parallel upgrade — higher-resolution raster

Re-export `corridor.webp` at the highest sensible size (target ≤ 1 MB Brotli/WebP). The bitmap
sits *under* the vector layer as a paper-tone backdrop. The vector layer carries the real detail
the user can zoom into.

---

## 3. Full UI review — what to tighten

### Topbar
Currently: title · Help · offline-pill. Add:
- **Group chip** on the left after the title (italic Fraunces, the group name from `plan?.name`). Tap → Group tab. Empty when no plan.
- **Relay status chip** on the right (per round-3 §2a — `Offline`/`Queued`/`Syncing`/`Updated`). Replaces or accompanies the static `offline core` pill.

### Map screen (`MapScreen.tsx`)
Information density is high. Current order: heading → map-actions → pulse-actions → report-grid → status → CorridorMap → metric grid → Local Pulse panel → Nearest Landmark panel → Bus Timeline panel. That's a lot to scroll.

Recommended reorder + condensation:
1. **CorridorMap** (the visual anchor — move to the top).
2. **Action row**: I'm here · Bus is here · Report (collapsed into one dropdown row when the report grid isn't open).
3. **Status strip** (single line): GPS ±X m · X m to route · battery-saver toggle.
4. **"Around you" panel** (folds the existing Local Pulse + Nearest Landmark into one card: latest bus, active reports, nearest landmark).
5. **Bus timeline panel** — collapses to a chip post-departure; opens on tap.

This brings the most-scanned thing (the map) to the top, halves the scrolling, and groups the
chatter into one card.

### Group screen (`PlanScreen` — rename to `GroupScreen` semantically)
Currently a single long form. Restructure into stacked **cards** in this order:

1. **Group identity card** — name, member count, plan version stamp, **Show invite** button (opens the QR sheet).
2. **Plan card** — meeting points + times + "if separated" + leave plan. Edit inline.
3. **Inbox card** (§4a) — recent activity + signals.
4. **Memories card** (§4b) — text memories thread.

The first three sub-cards become the natural "sub-tabs without sub-tabs" — one screen, scrollable
top-to-bottom, no extra nav primitive needed.

### Safety screen
Probably fine; add the **relay state recap** (last sync time, queued count) at the bottom for
honesty. Stays single-purpose.

### Action row (Map taps)
Current `report-button` tiles are full-width with `<span>` label + `<small>` hint. In a 3-tile
row on a narrow phone they wrap. Tighten:

- Single row, icons-first, tiny mono label below.
- "I'm here" / "Bus is here" stay as the two big actions; the 3 reports compress to icon chips.

### Forms (Plan card)
Long form is intimidating on first run. **Progressive disclosure** — show name + members + primary
point above the fold; "Show more" reveals fallback, if-separated, leave plan.

### Touch targets
≥ 44 px everywhere — currently mostly OK. Audit the Inbox/Memories rows once built.

### Empty states (every new surface)
- Inbox empty: *"Quiet for now. Tap a preset below or post when you have signal."*
- Memories empty: *"No memories yet. Tap below to capture a moment."*
- No plan: *"Make a plan or scan a friend's QR."*
- No GPS: *"Turn on Location. Airplane mode is fine."*

### Typography & spacing
Design system is enforced. Sweep these specifically:
- `--ink-mute` (50%) at 10px in sunlight — bump to 0.6 alpha or 11px.
- Mono caps line-height — keep ≥ 1.3 for readability.
- Touch targets on inline chat row.

### Honesty in copy
Every status line in the inbox/memories shows: source + age (`live`, `2 min`, `queued`). Already
the pattern; carry it into the new surfaces.

---

## 3a. Battery-saver redesign + intuitive UI sweep (the seamless pass)

> The structural review in §3 says **what** to reorder. This section is **how** to make it feel
> smaller, calmer, and one-touch.

### 3a.1 — Battery-saver: from a chunky toggle to a glyph

**Today:** a full-width `.toggle` with an 18 px native checkbox and a `MONO CAPS` label
("Battery saver"). Takes a row to itself in the `.map-actions` strip and shouts louder than the
map.

**Redesign — an icon-pill in the status strip:**

- **Size:** ~36 × 28 px (compared to ~44 × 168 px today).
- **Shape:** sharp rectangle, paper background, 1 px ink-line border (matches `.metric`/`.pulse-row`).
- **Icon:** hand-drawn SVG battery — 3 horizontal bars inside an outlined cell. **ON = top bar
  ink-mute, middle bar sage, bottom bar sage** (energy saved); **OFF = all bars red** (full draw).
  No animation on default; a single 200 ms colour pulse on toggle.
- **Label:** an optional 2-letter mono cap *"SV"* under the icon when the user hasn't toggled it
  before (first-run hint). Disappears after first tap.
- **Position:** the rightmost cell of the new condensed status strip (§3.5 below). Sits alongside
  GPS accuracy + distance-to-route as a peer, not above them.
- **A11y:** `<button>` with `aria-pressed`, label "Battery saver, on" / "Battery saver, off".

```jsx
<button
  type="button"
  className="icon-toggle saver"
  aria-pressed={batterySaver}
  aria-label={`Battery saver ${batterySaver ? 'on' : 'off'}`}
  onClick={() => setBatterySaver((v) => !v)}
>
  <BatterySaverGlyph on={batterySaver} />
</button>
```

CSS sketch:

```css
.icon-toggle {
  width: 36px; height: 28px; padding: 0;
  display: grid; place-items: center;
  border: 1px solid var(--line-strong); background: var(--paper);
  color: var(--ink-dim); cursor: pointer;
}
.icon-toggle[aria-pressed='true'] { border-color: var(--sage); }
.icon-toggle svg { display: block; }
```

The current `.toggle` CSS block can stay for elsewhere; this is a new `.icon-toggle` primitive.

### 3a.2 — Smart default + auto-promotion

- Default `batterySaver = true` already (correct for a multi-hour event).
- Use [`navigator.getBattery()`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/getBattery)
  where available. **If battery < 30 % AND user has saver OFF**, auto-enable + show a 2-second
  toast: *"Battery low — saver on. Tap the glyph to switch off."* One-shot per session.
- No nag; never auto-disable. The user always wins.

### 3a.3 — One row, three peers (the new status strip)

Replace today's `.map-actions` row + the separate `.metric` grid with a single horizontal status
strip that lives directly under the map (or pinned to the top of the screen-host on tall phones):

```
[ 🔵 ±14 m ]  [ ↗ 220 m to route ]  [ 🔋 SV ]  [ ⇄ QR ]
```

- Sharp tiles, 28 px tall, mono inside, no MONO CAPS on values (more humane).
- Each tile is tappable: the GPS tile opens a "Calibrate / re-fix" interstitial, the route tile
  centres the map on the route, the saver tile toggles, the QR tile opens the share sheet.
- This single strip replaces 4 separate UI elements today (`.toggle`, the QR button, the GPS
  metric, the route metric).

### 3a.4 — Cleanup items found in the sweep (specific, codex-actionable)

| What | Today | Improvement |
|---|---|---|
| `.day-banner` | full-width bar, red left border | thinner inline message (≤ 28 px tall, single line, mono small) — calmer day-of |
| `.wordmark-band` | 30 px tall, takes a row | trim padding to 6 px top / 4 px bottom; total ~22 px |
| Topbar `.offline-pill` | static, always says *offline core* | replace with the new **relay status chip** (§3 already specced) |
| `.inline-status` | shouty paragraph appears below action row | replace with a **floating toast** that auto-dismisses after 2.5 s (haptic + toast, not text-on-screen) |
| Report-grid (3 tiles) | full row of 3 chunky buttons | collapse into one **"Report ▾"** button; expands to inline chips on tap |
| `.map-actions` row | toggle + QR button stack | absorbed into the §3a.3 status strip |
| `.metric` tiles below the map | 2-up grid | absorbed into the §3a.3 status strip |
| `.location-panel` (nearest landmark) | always shown | a small chip on the map overlay itself ("Nearest: Highbury Fields · 230 m"); not a separate panel |
| `.panel.location-panel` "No GPS fix yet" | full panel | reduce to a one-line toast when GPS is denied |
| Bus timeline panel | always expanded | collapsed to a chip *"Bus expected ~14:34 →"*; expands on tap |
| Plan form | one long form | progressive disclosure — name + members + primary above the fold; *"More"* reveals the rest |

### 3a.5 — Feedback patterns: haptic-first, text-second

Replace persistent inline status with **transient, multimodal feedback**:

- **On every tap that saves:** brief 200 ms button-fill animation + a 30 ms haptic + a 2.5 s
  floating toast (paper background, ink text, sharp). Toast auto-dismisses; user never has to
  hunt for or close it.
- **On every tap that fails (GPS bad / no fix / accuracy too loose):** stronger 60 ms haptic + a
  red-tinted toast. Same auto-dismiss.
- **On every relay success:** silent + a 200 ms sage tick on the relay chip. No copy.
- The `inline-status` paragraph that hangs around the screen — gone. The screen-host should
  feel like it's listening, not lecturing.

### 3a.6 — Seamless flow notes

- **Sticky map.** As the user scrolls below the map, the map shrinks to a 96 px strip at the top
  (with the GPS dot still visible). One-tap restores full size. This is the parade — the map
  should never leave the viewport.
- **Long-press preset on inbox** (when we ship it) → posts immediately, no input. Tap = pick from
  list, long-press = confirm-and-send default.
- **First-run guide** — a 3-step pop-over on the very first parade-day open:
  1. *Tap I'm here to mark a moment.*
  2. *Tap Bus is here when you see the bus.*
  3. *Tap the QR icon to share your plan.*
  Dismiss-on-tap; never re-appears.
- **Haptic alphabet** — codify three vibration patterns and stick to them:
  - **Confirm:** single 30 ms pulse.
  - **Warn / rejected:** triple 60 ms pulse.
  - **Wow / arrived / mass-moment:** 30-30-200 ms pulse.
- **Sound off by default** (the parade is loud). The arrival chime is opt-in.

### 3a.7 — Codex pickup list for §3a

- New `<BatterySaverGlyph>` SVG component + `.icon-toggle` CSS primitive.
- `<StatusStrip>` component that consumes the lifted `gpsFix` + route distance + saver state
  + QR open callback. Replaces 4 existing surfaces (§3a.3).
- `<Toast>` host (one slot at a time, queued) at the App level.
- Battery-state hook: small util reading `navigator.getBattery()` with a graceful fallback.
- Sticky-map behaviour: an `IntersectionObserver` on the map container; when the screen-host
  scrolls past, the map collapses to the strip.
- Three-pattern haptic util in `lib/haptic.ts` (`confirm`, `warn`, `wow`).
- First-run guide via a single-use localStorage flag (`pc-first-run-seen`).

---

## 4. The new features — fit them in the 3-tab nav, no new tabs

> Section 0 cut Memory tab, Card, freeform chat, public wall. These additions respect the cut by
> living **inline** inside the Group tab (no extra tabs), all text-only, all group-scoped.

### 4a. Group inbox + signals + optional short text

A scrolling activity feed inside the Group tab.

**Content rows** (newest first):

| Row kind | Example | Source |
|---|---|---|
| Member joined | *Sarah joined* · 3 min | auto on relay handshake |
| Plan changed | *Plan updated by Tom* · 7 min | on `saveGroupPlan` from any member |
| Position update | *James — Holloway Rd · 2 min ago* | from relay position packets |
| Preset signal | *Tom: "see the bus"* · 1 min | preset list (below) |
| Short text (optional) | *Sarah: "by the clock tower 🟢"* · just now | text input (off by default in v1) |

**Preset signals** — fixed list, one tap each:

- *on my way*
- *at meeting point*
- *see the bus*
- *lost signal*
- *hold tight*
- *I'm okay*

**Input row** at the bottom of the inbox card:
- 3 preset chips visible; a `…` opens the rest.
- Text field hidden by default; a small *"text"* toggle reveals it (max 80 chars). Defaults to
  off so we don't ship freeform until codex confirms moderation/anti-spam policy.

**Schema** — new packet kind in the relay/QR-courier envelope:

```ts
type GroupSignalPacket = {
  kind: 'group_signal';
  id: string;
  source_id: string;
  display_name: string; // first name only
  preset: 'on_my_way' | 'at_meeting_point' | 'see_bus' | 'lost_signal' | 'hold_tight' | 'im_okay' | null;
  text?: string; // optional, ≤80 chars
  created_at: string;
  ttl_minutes: 180;
};
```

Local store: new `group_event` table in `shippie-db.ts` with the same pruning + cap as
`fan_event`.

### 4b. Memories — inline, text-only, group-scoped

Below the inbox, a second card titled **Memories**. A thread of short notes the user wants to
remember from the parade.

- Compose: textarea (≤ 140 chars). Auto-stamp time + snapped route segment.
- Scope: group-only (private, the moderation problem doesn't exist).
- List: chronological, latest first.
- Storage: new `memory` table in shippie-db (text-only for v1).
- Sync: same relay/QR plumbing as the inbox.
- Display: each row shows author + time + segment + the text.

Differences from the inbox:
- Memories are **for keeping**; the inbox is **for now**. Memories never expire; the inbox
  prunes at TTL.
- Memories are pulled into the wrap-up (§4c) post-event.

### 4c. End-of-parade wrap-up — auto-surface, "Your Day" lite

When the device clock passes `pack.event.startTime + 4 hours`:

- A small dismissable **wrap-up card** appears at the top of the Map screen:
  > **🏆 The parade's over.** *Open your day.*
- Tap → fullscreen **Your Day** view:
  - Headline: *"You were there. Sunday 31 May 2026."*
  - Distance walked (sum of GPS deltas — opportunistic, capped at sensible).
  - Number of taps you made + breakdown.
  - Number of memories you and your group posted.
  - Group highlights — first 3 memories, last bus sighting, "all five of you were here at 15:12."
  - A single shareable card image (the same SVG format used in the original `CardScreen`,
    just leaner).
  - **Save card** + **Share text** buttons.

All data is derived from local state. No new server calls. Dismissable — re-open anytime from a
small "your day →" chip in the topbar after parade-end.

---

## 5. Phased build for codex — 8 days to parade

| Day | Date | Deliverable |
|---|---|---|
| **D-8** | Sat 23 May | **QR fix** (Layer A + B) — start of day; verify with two phones. **GeoJSON extract** for the basemap. |
| **D-7** | Sun 24 May | **Stylized vector overlay** in CorridorMap (streets + stations + landmarks layers). |
| **D-6** | Mon 25 May | **Group inbox card** (UI + relay schema + local store). |
| **D-5** | Tue 26 May | Inbox **preset signals** wired (relay + QR courier). |
| **D-4** | Wed 27 May | **Memories card** (UI + storage + sync). |
| **D-3** | Thu 28 May | **Wrap-up card** + Your-Day view. Topbar relay chip + group chip. |
| **D-2** | Fri 29 May | UI tightening pass (§3): Map reorder, action-row compression, empty states, copy. |
| **D-1** | Sat 30 May | Device matrix + bug fixes. **Final route-pack push** with updated GeoJSON. |
| D-0 | Sun 31 May | Hot-fix window only. |

**P0 (must land):** QR fix · vector overlay · inbox preset signals · wrap-up card.
**P1 (try):** memories · inline text in inbox · UI tightening pass.
**P2 (v1.1):** image attachment in memories · public moments wall · QR short-code platform redirect.

---

## 6. The hard rules carrying forward

1. **Tier 0 (offline core) never blocks.** Inbox, memories, wrap-up all degrade gracefully to
   local-only when relay is down.
2. **Every datum shows age + source.** Inbox rows say "live"/"3 min"/"queued"; memory rows show
   GPS snap + time; wrap-up stats show "data from this phone only."
3. **Group-scoped only.** No global wall in v1.
4. **Text-only.** No images, no voice. Defer to v1.1.
5. **Honest QR copy.** The QR sheet keeps saying *"Scan on a phone that already opened Parade
   Companion before signal drops."* — that's a true precondition.
6. **The design system holds.** Inbox + Memories + wrap-up all in paper / Arsenal red / Fraunces
   italic / mono-for-data / sharp corners. No new fonts, no new colours.

---

## 7. Decisions for you (gate the build)

1. **Optional short-text in the inbox — enable in v1, or preset-only?**
   Preset-only is safer (no moderation needed). Text-on-by-default is more useful but invites
   abuse from a stray bored cousin.
2. **Memories scope — group-only (recommended), or also let users keep them private (just-for-me)?**
   Group-only is the lean shipping path; just-for-me adds a scope toggle and a per-memory
   visibility but no new screens.
3. **Wrap-up — auto-surface card on the Map at T+4 h, or button-only?**
   Auto is more delightful; button-only is more respectful of a user who's done. Recommend auto
   with a *"never again"* dismiss.
4. **QR short-code platform redirect — build now (one Cloudflare KV + a tiny route), or stay with
   the long URL inside the QR for v1?**
   Long URL works once Layer A/B land; the short-code is a delight upgrade.

Answer these and codex picks up the P0 list at dawn.
