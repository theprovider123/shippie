# Parade Companion — Live-Group Features (UI-led plan)

> Companion to all earlier parade docs. Reviewed against the goal flow:
> *load/save before parade → create group + share → friend joins (standalone too) → post memory & tap location & tap bus → group sees your location → all users see the bus → live interactive map → group signals → memories on a parade timeline (moderated)*.
> Date: 2026-05-23. Parade: 2026-05-31 — **8 days out.**
> Constraint repeated: ~1M people, near-zero signal, must work flawlessly.

---

## 1. Where we are today (committed: `644aa5f5`)

Branch `codex/parade-companion` is clean and committed. Baseline health green
(typecheck · 25/25 tests · build OK). What works against your flow:

| Flow step | Status | What's there |
|---|---|---|
| Load/save before parade | ✅ | `ReadinessChip` checks the cached basemap + route-pack + fonts; tells the user "Saved offline" or "Open on Wi-Fi to finish saving." |
| Create + share a group | ⚠️ partial | `PlanScreen` creates a **static** group plan (name, members, primary/fallback meeting points). Shares via QR + `#fragment` link. No live "group" — it's a snapshot. |
| Friend joins | ⚠️ partial | Hash decode triggers an import banner; saves the plan locally. No live join, no member roster, no presence. |
| Post memory / tap location / tap bus | ⚠️ partial | `PulseScreen` has 5 taps: *I'm here*, *Bus is here*, *Too crowded*, *Road blocked*, *Mark help spot*. **No "memory" concept** yet. Taps create local `fan_event` rows and sync only via manual QR. |
| Group sees your location | ❌ | No live relay. The group screen + `group-room.ts` were intentionally deleted. |
| All users see the bus | ❌ | No global broadcast. The `parade/bus-pulse` Worker endpoint + client were deleted. |
| Live interactive map | ⚠️ partial | `CorridorMap` is interactive (pan/zoom), shows your GPS dot + the route + your local fan-event clusters. Not live across users. |
| Group signals | ❌ | Does not exist. Recommendation below: preset group signals first, optional short text second. |
| Timeline + moderation | ❌ | Does not exist. `CardScreen` is the only "share" surface (a post-parade SVG). |

**Read:** of your 9 flow steps, 1 is done, 4 are partial, 4 are missing.

---

## 2. The honest constraint (restated — this drives everything)

You've asked for "live like Waze, group signals, public timeline" **and** "near-zero signal, 1M users,
flawless." Those don't both come for free.

**The model that does both: the degradation ladder.**

- **Tier 0 — Offline, always works (the core promise).**
  Map, GPS dot, plan, meeting points + compass, safety, your own taps and memories, QR sync.
  No phone in the world needs network for Tier 0.
- **Tier 1 — Opportunistic relay, when *any* phone catches *any* signal.**
  Group member live dots, group signals, bus pulse, timeline sync. Each phone uploads + downloads when
  signal flickers; the UI labels every datum with its age and source.
- **"Live like Waze" honest version:** the map IS interactive and updates; "live" data is
  opportunistic, not real-time. The UI must never imply otherwise.
- **"All 1M users see the bus" honest version:** an anonymous, per-route-segment aggregate served
  via edge cache (per Cloudflare's model). Users with no signal at all see the static schedule
  estimate. This is what the deleted `parade/bus-pulse` was — reintroduce, this time as committed.
- **"1M flawless" is true *because* it's sharded:** ~150k independent 6-person group rooms (one
  Cloudflare Durable Object each) + one global bus-pulse aggregate with edge caching. No global
  broadcast, no shared bottleneck. The core works with the relay completely off.

**Non-negotiable rule:** Tier-0 code paths must never await Tier-1 work. Every Tier-1 feature ships
behind a kill-switch so we can disable it on parade day if anything misbehaves.

---

## 2a. Opportunistic relay — use tiny scraps of Wi-Fi/signal without depending on them

Some fans will briefly catch pub Wi-Fi, venue Wi-Fi, transport Wi-Fi, shop Wi-Fi, or a few seconds
of cellular. That is enough to make the app feel alive **if the relay is treated as a burst-sync
accelerator, not a requirement.**

**Rule:** the app never says "failed" because the relay is absent. It says **saved**, **queued**,
**syncing**, or **last seen**.

### Relay behaviour

- Every phone keeps a local outbound queue: group position snapshots, group signals, short text
  memories, optional text notes, and bus sightings.
- When the browser sees `online`, or a relay request succeeds, it enters a short **burst window**
  (about 8-12 seconds). In that window it sends the smallest newest packets first:
  1. Safety/route-change ack + route-pack freshness check.
  2. Bus sightings.
  3. Group position.
  4. Preset group signals.
  5. Optional text notes.
  6. Text memories.
- After the burst, it backs off hard. No constant polling in a crowd.
- If a request times out, the queue remains local and the UI stays calm.
- Captive portals are treated as offline until a real relay health check succeeds.

### UI states

The topbar relay chip has four states:

| State | Meaning | Copy |
|---|---|---|
| `Offline` | no working relay | "Saved on this phone" |
| `Queued` | there are unsent packets | "Will sync when signal appears" |
| `Syncing` | burst window is active | "Catching up..." |
| `Updated` | recent relay round-trip | "Updated 2 min ago" |

No spinning loaders. No blocking modals. No screen that depends on the relay to render.

### Data budget

Everything sent during parade mode must be tiny:

- Position packet: ~40-80 B.
- Bus sighting: ~80-140 B.
- Preset group signal: ~80-140 B.
- Optional text/memory: text-only, max 140 chars.
- No image/video upload during the parade.

This means even bad Wi-Fi can move useful state. One successful 2-second burst can update a group
and add a bus sighting to the global pulse.

### Relay topology

- **Group rooms:** encrypted per-group Durable Object. Only the group secret can read/decrypt.
- **Bus pulse:** anonymous route-segment aggregate. No identity, no raw public location feed.
- **Safety:** one-way broadcast / route-pack update check. This gets priority over optional text/memory.
- **Local QR sync:** remains the no-network path and should carry the same compact packets as the
  relay queue, so QR and relay reinforce each other.

### Implementation notes for weak signal

- Do **not** trust `navigator.onLine`. Run a real relay health check with a short timeout (~1200 ms).
- Start with short HTTP burst sync, not a long-lived socket:
  - `POST /room/:roomId/batch` for queued group packets.
  - `GET /room/:roomId/since/:cursor` for new group packets.
  - `POST /bus/batch` for bus sightings.
  - `GET /bus-pulse?since=:cursor` for the compact aggregate.
- Only upgrade to a WebSocket/gossip subscription after a stable relay window (> 15 s). Close it
  when the app backgrounds, battery is low, or the health check starts failing.
- Every packet has `id`, `source_id`, `created_at`, `ttl`, `kind`, and a tiny payload. Dedupe by
  `id`; expire by `ttl`; tolerate clock drift by rounding all age labels.
- The QR courier payload and relay batch payload use the **same packet envelope**. That prevents
  two sync systems and lets a packet move by QR, relay, or both.

### Design principle

When signal appears, the app should feel like it quietly caught its breath. When signal disappears,
the user should barely notice.

---

## 3. The IA — what the app looks like

We currently have 6 nav tabs (Pulse · Map · Plan · Meet · Safety · Card). Adding group relay,
fast signals, memories, chants, and safety without bloating the nav means **collapsing Plan + Meet
into "Group"** and folding Pulse into the Map.

**Final bottom nav (4 tabs):**

```
[ Map ] [ Group ] [ Memory ] [ Safety ]
```

Map carries the fast Pulse actions as a floating action row: **I'm here · Bus is here · Report**.
Card becomes **Your Day** inside Memory after the parade. Group is one tab with three sub-tabs at
top: **Plan · Members · Signals**. Use preset signals for v1, not freeform chat-first UI.

---

## 4. The flow, step by step — UI design + what codex needs to wire

### Step 1 — Load / save before parade
**Today:** `ReadinessChip` (in topbar). Good — keep.

**UI improvements:**
- Promote it to a small **first-run setup card** that appears once on the Map landing — three
  numbered steps: ① Saved offline ✓ · ② Make a plan → · ③ Invite your group →. Dismissable;
  re-appears if any step regresses.
- The chip stays as a persistent reassurance after dismissal.

**Codex functional work:** none new — reuses existing cache check + sets a `setup-dismissed` flag
in `localStorage`.

---

### Step 2 — Create a parade group and share with a friend
**Today:** Plan screen has a form + a "Share QR" button that opens `QrShareSheet`.

**UI changes (this is the biggest IA shift):**
- Rename **Plan → Group** in nav. The "plan" is the group's pre-agreed meeting plan.
- **Group screen** with three sub-tabs (segmented control at top):
  - **Plan** (existing form, restyled)
  - **Members** (NEW — see Step 5)
  - **Signals** (NEW — see Step 8)
- Move the QR-share into a dedicated **Invite screen** (full-bleed sheet): big QR (≥ 280×280 dp),
  the **room name** in italic Fraunces below ("The Invincibles"), a copy-able **6-char room code**
  and a short **invite link** as text fallback (no QR scanner? read out the code), a small "Joined:
  *2 of 5*" counter that updates as members appear (relay-tier; degrades to "shared" offline). One
  primary action: **Done**.
- Empty state on Group: when no plan exists, a friendly card — *"Make a parade group. Set where to
  meet, share it with your friends, find each other on the day."* Two CTAs: **Create group**,
  **I have an invite** (paste-code field).

**Codex functional work:**
- The "group" is a *room* identified by a stable id + a secret (the relay key). Generate both on
  group create; persist alongside the plan. On import, the joiner reads room id + secret from the
  fragment (already partly in `decodePlan` payload — extend the schema).
- Add a "Show QR / copy code" affordance on Group → Plan tab (always reachable; not buried).

---

### Step 3 — Friend joins (with a standalone environment)
**Today:** A shared `#fragment` is decoded → import banner on Plan → save.

**UI changes:**
- Joiner sees a **Join preview** card BEFORE saving:
  *"Join 'The Invincibles' (5 members)? Primary meet: Outside Emirates, 8am. Fallback: Clock tower."*
  Buttons: **Join group** / **Not now**.
- After join: a persistent **group badge** in the topbar — *"The Invincibles"* in mono caps. Tap →
  Group screen.
- "Standalone environment" — clarify this rule throughout the UI: **your taps and memories live on
  your phone. They sync to your group only when you say so** (a per-item *"Share with group"*
  toggle on the composer; default ON for taps, default OFF for memories). Make this rule visible in
  the first-run setup card and the Memory composer.

**Codex functional work:**
- Schema bump on the shared `#fragment` to include the room id + secret.
- A simple membership model: when relay is up, broadcasting your presence into the room adds you to
  the visible roster. No accounts; identity is the local `getFanSourceId()` + the display name.

---

### Step 4 — Post a memory · tap your location · tap if you see the bus
**Today:** `PulseScreen` has the 5 tap buttons. No memory composer. No text note.

**UI changes:**
- Keep the tap buttons (they are the fast, low-effort core).
- Add a **"Post memory"** primary action on Pulse + a floating action button on Map. Opens a
  bottom-sheet composer:
  - Single short text field (~140 chars). One-line placeholder: *"What just happened?"*
  - **No image in v1.** Image/video belongs in v1.1; it is too expensive and distracting for the
    parade-day core.
  - A small location chip (auto-stamped from GPS, with the same `isReportableGpsFix` guard the
    taps use). User can remove it ("Don't tag location").
  - A **scope toggle**: *"To my group"* (default OFF for first-time use; remembered after) ·
    *"Just for me"*. No public option in v1 (see § 6 Moderation).
  - Primary: **Post**. Secondary: **Cancel**. Status line: *"Saved on your phone. Syncs to your
    group when any of you have signal."*
- After post: small toast *"Saved. 3 in your memory timeline."* Tap → Memory screen.
- The existing taps' status copy gets the same honesty pattern: *"Saved. Carries phone-to-phone by
  QR; syncs to the group automatically when signal returns."*

**Codex functional work:**
- New `memory` table: `id`, `kind` (`note`), `text`, `lng`, `lat`, `accuracy_m`, `scope`
  (`private`|`group`), `created_at`, `sync_status` (`local`|`queued`|`synced`).
- Pruning: cap memory rows the same way `fan_event` is capped.

---

### Step 5 — Your group sees your location (live, opportunistic)
**Today:** Nothing. The deleted `group-room.ts` had the architecture; reintroduce it.

**UI changes:**
- **Group → Members** sub-tab: a list, one row per group member (yourself first):
  - Initials chip (sage if live · gold if 1–3 min · ink-muted if 4–14 min · dashed outline if
    "not seen yet" or > 15 min).
  - Name · last-known street segment (e.g. *"Holloway Rd · 2 min ago"*).
  - Tap a row → centers the Map on that member's last-known dot.
- On the Map: group members render as named dots (sage/gold/faded by age). Stale > 10 min fades
  toward outline-only.
- A tiny **relay status chip** in the topbar — three states: *Live* (sage dot) · *Connecting…* ·
  *Offline* (ink-muted). Tap → shows what's queued + what the chip means.

**Codex functional work:**
- Reintroduce the relay client (the deleted `group-room.ts` was 108 lines; same shape via
  `@shippie/spaces` `createEncryptedGossipRoom`).
- GPS source: lift `watchGps` to `App` (simplification S2 from the earlier plan). One watch, one
  battery policy, shared `gpsFix` passed to `MapScreen` + the group publisher.
- Throttle position broadcasts to ≤ 1 / 30 s. Include accuracy + `created_at`. Never publish a
  position older than 90 s (rather show "not seen yet").
- Privacy: members only see each other; no global location broadcast ever.

---

### Step 6 — All parade users see where the bus is
**Today:** Local-only bus taps. Global aggregation deleted.

**UI changes:**
- On the Map: route segments **glow** by crowd-sourced bus confidence (red = many recent reports;
  gold = some; faint = old). This is the resurrected "Bus Pulse." Hover/tap a glowing segment →
  *"Bus seen ~3 min ago by 12 fans"*.
- A **Bus card** on the Map (sticky bottom, slim): combines static + live —
  *"Static estimate: ~14:34. Crowd: last seen Holloway Rd, 3 min ago, 12 fans."*
- The Pulse "Bus is here" tap stays. After tap, copy: *"Sent to the parade if you have signal."*

**Codex functional work:**
- Reintroduce the small Cloudflare Worker + Durable Object that ingests `bus_seen` packets (anon,
  no device id; rate-limit by IP at edge) and serves an aggregated `bus-pulse.json` with edge cache
  (10–30 s TTL).
- Honest scaling note (true for 1M phones): reads collapse on the edge, writes are throttled
  per-IP. Tested at scale.

---

### Step 7 — Live interactive map (Waze-honest)
**Today:** Interactive pan/zoom; static unless you tap.

**UI changes:**
- A **layer toggle** (top-right of the map): *Group · Bus · Reports · My taps*. Each off by
  default for new users except *My taps*; lights up as data exists.
- An auto-refresh indicator: a tiny mono "↻ 12s" countdown when relay is live, replaced by *"queued"*
  when offline. Never moves dots silently — every refresh has a visible tick.
- The **accuracy radius** on the GPS dot stays — never imply more precision than we have.
- *Follow* affordance (lower-right): three buttons — *Me · Group · Bus* — center the map on each.

**Codex functional work:**
- A single relay subscription per app session (not per screen). Pump updates into a small in-memory
  store; screens read from it.
- Diff renders, not full clears — the canvas redraw cost on a low-end Android shouldn't compound.

---

### Step 8 — Group signals (chat without the distraction)
**Today:** Nothing.

**UI changes (Group → Signals sub-tab):**
- Default composer is **preset signals**, not a blank chat box:
  - `I'm here`
  - `Heading to meeting point`
  - `I saw the bus`
  - `Too crowded here`
  - `Leaving now`
  - `Need help`
- A compact message list (bottom-anchored, newest at the bottom). Each signal/message:
  - Sender initials chip + name · age (*"2 min ago"*).
  - The signal body.
  - **Delivery status** as a tiny mono glyph: *●* sending · *✓* sent to relay · *⏳* queued offline
    · *!* failed.
- Optional text reply is behind a small `Write note` affordance, max 80 chars. This keeps the
  parade UI fast and reduces moderation/bandwidth.
- Empty state: *"Send quick signals to your group. They queue offline and sync when any phone
  catches signal."*
- Notification dot on the Group nav tab when there are unread messages.

**Scope note (v1):** text/signals only. No photos, videos, stickers, voice notes, or public chat.

**Codex functional work:**
- Same gossip room as group locations; messages are a payload variant. Encrypted end-to-end with
  the shared room secret.
- Local store: `group_signal` table; ordering by `created_at`; dedupe by id.
- Relay bursts prioritise preset safety/location signals above optional text notes.

---

### Step 9 — Memories on a parade timeline (and moderation)
**Today:** Nothing. The card is post-parade.

**Decision needed (and my honest recommendation):** there are two flavours of "timeline."

| Option | What it is | Moderation cost |
|---|---|---|
| **A — Group timeline** (recommended for v1) | Each group's own shared memory feed. Only group members can post or see. | **None.** It's your friends — they self-moderate. |
| **B — Public "parade wall"** | A global timeline of all fans' opt-in public memories. | **High.** 1M users → real moderation infrastructure: rate limits, automated text classifiers first, media classifiers later, a report queue, human reviewers, takedown latency. Conflicts with the no-account / no-login ethos. |

**Strong recommendation: ship Option A for parade day. Defer Option B to v1.1** as a constrained
"moments wall" if you still want it (with text-only first, media later, and a clear submission
flow that puts every post through review before going public — i.e. it's NOT live).

**UI changes (Memory tab):**
- Top: composer affordance (a chip: *"+ Post a memory"* opens the Step-4 sheet).
- Below: **timeline list** — newest first. Tabs across the top to filter: *Mine · Group · Saved*.
  - Each row: initials, name, age, the text, the snapped street segment, a **save** button (heart
    icon — keep for the personal Card).
  - For *Group* rows: a small Report button (long-press or `…` menu) → "Report to your group" — this
    is for group self-moderation, not a global queue. Reporter sets the post's visibility to
    *flagged*; group members see it greyed out with the reporter's name; group can vote to remove.
- Empty state when no group: *"Posts you make appear here. To share with friends, join or create a
  group."*

**Codex functional work:**
- Memory rows broadcast over the gossip room (same crypto as group signals). One memory = one signed packet.
- Add a `flagged_by[]` field. Group consensus rule (≥ ⅓ members flagged) auto-hides; UI shows
  *"Hidden by your group"* with an *"Show anyway"* opt-in.
- Image/video is intentionally absent in v1. v1.1 can add media as Wi-Fi-only upload with
  on-device moderation, explicit review, and a separate bandwidth budget.

---

### Step 10 — Chants, lightly

**Goal:** make the parade feel Arsenal-shaped without making the app a lyrics app or distracting
people from the street.

**UI changes:**
- Add a **Chants** drawer inside Memory and the Map tap sheet. It is one click away, never a nav
  tab.
- Show **chant titles/cues only** plus a simple beat/haptic rhythm. Do not ship full copyrighted
  lyrics or recordings unless licensed.
- Each chant row has one action: **Joined**. Tapping it saves a local memory marker like
  *"Joined North London Forever near Holloway Rd"* for the Your Day recap.
- Preload a tiny `chants[]` route-pack field:
  - `id`
  - `title`
  - `cue` (short, non-lyrical)
  - `momentHint` (optional route-pack moment id)
  - `beatPattern` (optional vibration pattern)
- If a route-pack moment fires, the app can suggest one chant cue in a full-screen line for a few
  seconds, then disappear. No autoplay.

**Codex functional work:**
- Add `chants[]` and optional `moments[].chantId` to the route pack.
- Add a `chant_joined` memory/signal type.
- Add haptic pattern playback behind a one-tap user action; do not loop.

---

## 5. Edge cases & failure modes the UI must handle

These shape the visual states. Every one is a known failure to design around, not an oversight.

| Case | UI behaviour |
|---|---|
| **Never had signal** all event | Group members show as *"not seen yet"*; bus pulse layer is *off*; group signals show *"will sync when any of you has signal"*; everything else works. |
| **Caught 5 seconds of Wi-Fi** | Relay chip switches to *Syncing*, sends bus/safety/group packets first, then returns to *Updated 2 min ago* or *Queued*. No screen blocks on it. |
| **Captive portal says online but relay is blocked** | Health check fails; app treats it as offline. Queue remains local. |
| **Pub Wi-Fi is overloaded** | Burst window times out quickly; backoff increases. The app avoids aggressive retry loops that drain battery or worsen congestion. |
| **My GPS is denied or off** | Map shows *"GPS off — turn on Location to share your dot"*; tap actions disabled with the same prompt; the plan + compass + safety stay usable. |
| **My phone storage is full** | Memory composer stays text-only and warns before saving if local storage is critically low. Your Day warns if it cannot render a PNG. |
| **Battery low** | A small *"low battery — relay paused"* chip; relay throttles to a lower cadence; user can override. |
| **GPS accuracy is bad (> 350 m)** | Same guard as today: tap rejected with *"GPS is ±420 m — wait for a tighter fix."* |
| **Group member's last position is > 15 min old** | Member chip is dashed outline + name; map dot is outline-only with *"last seen 18 min ago"* label. Never a solid dot for stale data. |
| **Two members edit the plan at once** | Last-write-wins by timestamp; UI shows *"Plan updated by Sarah · 3 min ago"* banner; an *"undo"* if it was you. |
| **Joined the wrong group** | Group → Plan tab has a clear **Leave group** action (destructive confirm; explicitly says local copies of your taps stay on your phone). |
| **Lost the invite QR** | Group → Plan tab always shows the **room code** (mono caps) + a *"Show QR"* button — anyone in the group can re-invite. |
| **A peer tries to spam group signals** | Per-sender throttle (max 1 message / 2 s); the receiver UI shows *"slowing 'Tom' — too many messages"*; long-press a name → **Mute in this group** (local). |
| **Memory contains slur or abuse** | Group's flag/consensus rule (Step 9); receiver can also one-tap *"Hide"* locally. |
| **Memory post fails to sync** | Memory row shows *"queued"* with a retry control; the local copy never disappears. |
| **Relay is unreachable** | Status chip → *Offline*; all sends queue; the UI never spins forever. |
| **Phone is shaken / dropped (accidental taps)** | The 5 Pulse taps have a brief (~120 ms) confirm-press window: a quick fill-up animation and a haptic; release inside the window posts. Lift early = nothing. |
| **Standalone vs group identity** | The topbar group badge tells the user *which* persona they're in. Memory composer's scope toggle is large and labelled. |

---

## 6. Moderation strategy (your direct question)

For v1 (this parade) — **group-scoped timeline only**. No global wall. Why:

- 1M public posters needs a real moderation pipeline (ML text classifiers first, media classifiers
  later, human queue with
  SLA, reporter accounts, takedown latency). Building that in 8 days is unsafe.
- Group-scoped timeline is **self-moderating** by the social tie. The ⅓-flag consensus rule + local
  hide is enough for the friend-group case.
- *Defer* a global wall to v1.1, and design it as an opt-in submission to a curated wall (every
  post reviewed before going public) — not a live firehose.

UI elements that exist for safety regardless:
- Per-post **Hide** (local, instant).
- Per-post **Report to group** (consensus rule).
- Per-sender **Mute in this group** (local).
- A small **Code of Conduct** chip on the Memory tab linking to a 6-line plain-language statement
  in the app.

---

## 7. Codex functional work list (what UI cannot do alone)

These are codex's tasks; UI specs above are mine. Severity for parade-day shipability.

**P0 (must ship for the flow to work)**
- Group **room model**: id + secret, generated on create, persisted alongside plan; extended in
  the shared `#fragment` payload.
- Reintroduce the **relay client** (`@shippie/spaces` gossip room) with encrypted payloads. Three
  payload variants: position, group signal/message, memory.
- Add the **opportunistic relay queue** (§2a): local outbound queue, burst-sync ordering, relay
  health check, captive-portal detection, backoff, and calm `Offline/Queued/Syncing/Updated` chip.
- **`memory` table** + persistence for text-only notes, scopes, queue status, and local flags.
- Lift `watchGps` to `App` (one source, one policy, shared `gpsFix`).
- **Bus pulse Worker + DO** + the bounded edge-cached aggregate read. (Reintroduce; was deleted.)

**P1**
- Group signal/message ordering, dedupe, throttle, mute-local list.
- Memory flag/consensus rule (≥ ⅓ flagged → hidden by group).
- Memory cap/pruning and the **Your Day** PNG export path.
- Kill-switches: per-feature flags read from `shippie.json` or a small JSON in `runtime_assets`,
  so we can disable relay/optional text/timeline on the day if anything misbehaves.

**P2 (post-launch / v1.1)**
- The constrained public "moments wall" with submission + review (curated, not live).
- A simple in-app "what is queued" panel for power users.

---

## 8. Phased plan (8 days to parade — aggressive, honest)

Today is **Sat 23 May**, parade is **Sun 31 May**.

| Day | Date | UI (me/Claude) | Codex |
|---|---|---|---|
| D-8 | Sat 23 | Sub-tab structure inside Group; Invite-screen design; group-badge in topbar; Memory tab scaffolding | Branch off; relay client + room model |
| D-7 | Sun 24 | Members sub-tab UI; layer-toggle + follow controls on Map; relay status chip | Position publish/subscribe + throttle |
| D-6 | Mon 25 | Signals sub-tab UI (preset grid, optional note, delivery glyphs, empty state) | Group signal payload over relay; dedupe/order/throttle |
| D-5 | Tue 26 | Memory composer sheet; timeline list (Mine/Group/Saved tabs) | `memory` table; text sync; pruning |
| D-4 | Wed 27 | Bus card on Map; bus-pulse layer styling; first-run setup card | Bus pulse Worker + DO + edge cache |
| D-3 | Thu 28 | Edge-case states (offline, no GPS, low battery, full storage, stale, queued, flagged); copy pass | Kill-switches; relay reconnect + backoff |
| D-2 | Fri 29 | Device matrix test + fixes (old iPhone Safari, A2HS, low-end Android) | Hardening; load test the Bus Pulse Worker |
| D-1 | Sat 30 | Final route-pack push; launch copy | Hot-fix window only |
| D-0 | Sun 31 | Monitor | Hot-fix window only |

**What's stretch:** the consensus-flag UI for memories. Media attachment is deliberately v1.1. If
we slip, ship text-only memories and a simple local Hide. The offline core (Tier 0) is already done
and must never regress.

**Sequencing rule:** every day ends with `typecheck` + tests + build green. Feature flags off by
default for any P0 wiring that lands mid-stream.

---

## 9. The hard non-negotiables (carry into review)

1. **Tier 0 is sacred.** The map, GPS dot, plan, meet, safety, your own taps and memories *must
   work with the relay off entirely.* If a feature can break Tier 0, it's wrong.
2. **Every dot, every message, every datum shows its age and source.** No silent live dots. Stale
   means visually different.
3. **No memory ever auto-publishes publicly.** Group scope is the only multi-user destination in v1.
4. **Every relay feature is kill-switchable.** On parade day, if optional text misbehaves, we
   disable text without redeploy while preserving preset group signals and the offline core.
5. **Honesty in copy.** *"Live"* means now; *"saved"* means on your phone; *"queued"* means waiting
   for any signal. No marketing voice anywhere near a status.
6. **Battery before features.** Already lifted by S2 (one GPS source); the relay also gets one
   subscription per session, not per screen.
7. **The design system holds.** Every new screen uses the paper / Arsenal-red / mono-data /
   sharp-corners / Fraunces-italic grammar in `2026-05-22-parade-companion-design.md`. No new fonts,
   no new colours, no rounded corners.

---

## 11. Self-review — flaws in this plan, and pioneering moves to add

_A second pass with fresh eyes. Where am I being too conservative? Where can the constraint
("no internet, 1M users") become a creative advantage instead of a limit?_

### 11a. Flaws in this plan I'm fixing

| Flaw | Fix |
|---|---|
| **5-tab nav is still busy** — Pulse and Map overlap (taps + summary on one, map + summary on the other). | **Fold Pulse into Map.** Taps become a slim floating action row at the bottom of the Map screen. Final nav: **4 tabs — Map · Group · Memory · Safety.** Honors the design brief's "minimal UI" better. |
| **Media in v1 memory is a footgun** — ~100 KB × 1M users × per-group fanout = real bandwidth/$. | **Ship text-only memories for v1.** Media attachments land in v1.1 with on-device checks. Captions ≤ 140 chars. |
| **"After the parade" is thin** — Card is a static SVG. | **"Your day" auto-recap** — GPS trace + tap timeline + your group's memories assembled into one beautiful one-pager. PNG export. (Replaces the current Card; same nav slot reused.) |
| **No bandwidth/cost playbook** — relay/DO costs at 1M aren't on paper. | Numbers + kill-switch order in §11c. |
| **Time sync across phones is implicit** — phones drift. | Every age label tolerant to ±60 s drift; never show seconds. "live · 2 min · 14 min · last seen 1 h." |
| **App updates during the event** can break SW caches. | **Version-pin during parade week** — service worker uses `skipWaiting: false` from 30 May 00:00 until 31 May 23:59. Users keep the version they had. A `morning-of` route-pack update is the only allowed change. |
| **Bus tap loss when phone dies** before any sync. | Solved by §11b QR courier sync — anyone who scanned you that day can re-spread your data. |
| **Tiny bits of Wi-Fi are underused.** | §2a turns weak connectivity into burst-sync windows: bus/safety/group packets move first, everything else waits. |
| **Media moderation in a public wall** can't rely on group consensus. | **On-device classifier** in §11b. Defers human review to a tiny queue. |

### 11b. Pioneering workarounds for "no internet, 1M users"

Real, browser-doable, not vapor. Each genuinely fits this medium.

1. **QR courier sync (sneakernet)** — the breakthrough idea.
   Right now, each phone's QR sync only re-exports *that phone's own* fan events. Change the
   payload to also include "recent events I've heard from others." When two friends bump into each
   other and scan a QR, A imports B's stuff *and* B's neighbour Charlie's stuff that B picked up
   earlier. **Data spreads physically through the crowd, with zero backend.** A bus tap in the
   morning can reach a phone across town by evening via 3 hops of friends. Bound the payload at ~36
   most-recent events (already the cap in `encodeFanEventsForSync`), TTL-protected, dedupe by id.
   **This is the genuinely novel thing this app can do that no other app does.**

2. **Time-coordinated "mass moments"** — pre-baked into the route pack.
   The route pack carries a `moments[]` list: "14:00 parade start," "14:34 bus expected at Holloway
   Rd," "16:00 collective scarf hold," etc. Every phone runs these on its own clock — at the
   moment, a unified vibration + a single line of italic Fraunces ("*the bus is here*") fills the
   screen. **100,000 phones vibrating at the same instant, with no network**. Pre-shared schedule;
   purely client-side. Powerful, simple, brand-defining.

3. **Hub-at-the-pub** — operational not code.
   Partner with 5–10 pubs along the route to run a small "Shippie hub" — a $30 travel router + an
   always-on Raspberry Pi (or even a laptop) serving a local Shippie relay over the pub's Wi-Fi.
   Anyone in pub range auto-syncs with everyone else. **The meeting point becomes the data point.**
   This is real-world infrastructure that turns the social geography of the parade into the network
   topology of the app.

4. **Anchor phones at known points** — also operational.
   Place ~10 organizer phones along the route with power banks + sometimes-working cellular (or a
   Wi-Fi backhaul if a friendly venue is nearby). They publish bus sightings on a fixed cadence
   from a known location. The crowd's data stays honest even when most of the crowd is silent.

5. **Ultrasonic "we're nearby" handshake** — passive, no permission to play.
   Phones in the same group emit a short, near-inaudible (18–19 kHz) chirp encoding their group's
   short code every ~5 s; phones that grant mic access listen and surface *"3 of your group nearby"*
   when they hear matching chirps. Range ~5–10 m in a noisy crowd — but the use case ("are my
   friends actually here?") fits that range perfectly. **Real browser API** (Web Audio Oscillator
   + getUserMedia). No network. Experimental, opt-in, off by default.

6. **Predictive bus position from sparse sightings** — Kalman-lite on the route line.
   When the crowd's bus reports are sparse (e.g. 4 reports in 20 minutes), don't show 4 fake dots
   — interpolate a *position range* along the route, widened by uncertainty + decayed by age. The
   UI shows a glowing **band** (not a point) labelled "*likely between Holloway Rd and Highbury
   Corner · last update 4 min ago*." Honest about confidence; useful when data is thin.

7. **Relay burst windows** — use weak Wi-Fi without relying on it.
   When the app detects a real relay health check, it opens an 8-12 second burst window and drains
   the queue in priority order: safety/route freshness, bus, group position, group signals, optional text,
   text memories. This turns scraps of Wi-Fi into meaningful state transfer while preserving the
   offline-first promise. The UI says *"Syncing..."* and then *"Updated 2 min ago"*; it never blocks
   a core screen.

8. **PWA Web Push for safety-critical broadcasts only** — opt-in subscription.
   Most browsers support Push API (iOS Safari 16.4+). Use **only** for genuine safety alerts
   (dispersal, route change, medical hold). The route pack carries a `pushChannel` id; pushing to
   it reaches every subscriber regardless of foreground state. Not for group chatter, not for memories —
   safety, period. The UI for subscribe is on the Safety tab with a one-line consent.

9. **On-device text moderation** — `tflite`/Transformers.js mini-classifier (~3 MB).
   Pre-cache a tiny abusive-language classifier. Before any post leaves the device (relay or
   public-wall in v1.1), run it client-side; on a strong hit, show *"This message looks abusive —
   edit?"* with a soft block. **Moderation that works offline.**

10. **Apple/Google Wallet pass for the group plan** — survives everything.
   On group create, generate a `.pkpass` / Google Wallet pass with: meeting points, the room code,
   an "if separated" line, and a QR to re-join. **Survives a dead browser, a wiped cache, a lost
   phone passed-along.** Pre-event distribution channel.

11. **Voice memory** (post-launch).
    "Hold to speak" — 8-second audio clip, tiny (~20 KB Opus). Auto-transcribed locally with
    Whisper-tiny when the chip allows. Inclusive for users who don't want to type; a captured
    audio of the crowd is uniquely parade-shaped.

### 11c. Bandwidth / cost playbook (the "what if it gets hot")

Honest scaling math for 1M concurrent users over a 3-hour window, all on Cloudflare's edge.

| Surface | Volume | Mitigation | Kill order if it overheats |
|---|---|---|---|
| Static assets (app, basemap, fonts) | one-time + cache | Edge cache, immutable hashes | n/a (cache hit) |
| Route-pack JSON | rare reads | 5-min edge TTL, ~5 KB | n/a |
| Bus Pulse aggregate read | huge — 1M phones polling every 30 s = 33k rps | **10–30 s edge cache → ~1 origin hit per cache window per data centre.** Worst case ~500 origin rps. | **last to disable** |
| Group position broadcast (per room) | 6 members × 1 per 30 s = 0.2 rps per room. 150k rooms = 30k rps spread across DOs. | One DO per room; throttle 1 / 30 s; binary payload (~30 B). | **first to throttle (60 s); then 90 s; then disable** |
| Relay burst windows | bursty at Wi-Fi edges | 8-12 s window, priority queue, exponential backoff, max one room subscription per app session. | **shorten burst window; then group-only; then bus/safety only** |
| Group signals/messages (per room) | bursty, but per-room. | Same DO; preset signals first; optional text max 80 chars; rate-limit per sender 1 / 2 s. | **second to disable** |
| Memory sync (per room) | low rate, text only | Same DO; payload ≤ 200 B; dedupe by id. | **third to disable** |

**Kill-switch playbook (manual lever, no redeploy):**
1. Throttle group position broadcasts (60 → 90 → 120 s cadence).
2. Disable optional text notes; keep preset group signals.
3. Disable memories.
4. Disable group position entirely (Members goes to "last known" only).
5. Bus Pulse remains until last — it's the most valuable broadcast feature and the cheapest to serve.
6. Offline core never depends on any of the above — it just keeps working.

### 11d. "Magic moments" — features the medium uniquely makes possible

The bar is not "useful." The bar is **"only this app, in this place, on this day."**

- **The mass haptic moment** (§11b#2). Pre-shared schedule; thousands of phones pulse together.
- **The QR courier spread of bus sightings** (§11b#1). Your friend brings you updates from across the route.
- **The relay breath.** Someone catches a few seconds of pub Wi-Fi and the whole group quietly catches up.
- **The "Your Day" recap** (§11a — replaces Card). One-page artifact, your parade as a beautiful object. Auto-generated, downloadable, shareable.
- **Collective sound capture (post-launch, opt-in).** 5-second ambient audio at tap time, aggregated by location into a "sound map of the parade." A real document of the day, only possible because everyone was tapping.
- **The group's first reunion ping.** When your group's roster is all-green for the first time (everyone has caught signal), a small italic line crosses the top: *"All five of you, here."* A tiny social moment.

### 11e. Operational concerns the user needs to own

Code can't solve these — they're partnerships and logistics.

- **5–10 pub hubs along the route** (§11b#3). Need outreach this week. 8 days is tight; even 2 would matter.
- **5–10 anchor phones** with organizer accounts (§11b#4). Needs people willing to walk the route or stand at known spots with a power bank.
- **A push notification gateway** + a single "press the big red button" page for the organizer to issue safety pushes. Built but **never used** unless there's a real safety event. Trained recipient list.
- **A morning-of "is the route changed?" check** with Islington Council / Met Police press desk. The route-pack push is the corrective lever.
- **A no-publish bargain.** No global wall in v1. If the press asks "where's the public Twitter wall of memories?", the answer is *"This app is for being there, not for posting from it. Your group has the timeline."*

### 11f. Updated phasing impact

Add to the schedule in §8:

- **Day D-8 (today):** also start operational outreach — pub hubs, anchor phones.
- **Day D-7:** route-pack `moments[]` schema; first mass-haptic test.
- **Day D-6:** extend QR courier payload (cheap — schema change in `encodeFanEventsForSync`) and add relay burst queue.
- **Day D-5:** Predicted-bus band on the Map (no new data, just a rendering change).
- **Day D-4:** Web Push subscribe on Safety tab (opt-in, off by default).
- **Day D-3:** Wallet pass generator (`.pkpass`); freeze the SW version.
- **v1.1 (post-parade):** media memories, voice memory, on-device text/media classifiers, public moments wall with submission review, ultrasonic group handshake, collective sound capture.

### 11g. Updated decisions in §12

The flaw-fix changes one of the decisions; the others stand:

- **Nav:** I now recommend **4 tabs (Map · Group · Memory · Safety)** with Pulse-as-FAB on Map.
- **Memories:** **text-only for v1** confirmed; media lands in v1.1.
- **Timeline scope:** **group-scoped only for v1** confirmed; the curated, reviewed-before-public moments wall is v1.1.

---

## 12. Decisions for you (gate the build)

1. **Group timeline only for v1 (recommended) — or attempt a constrained public wall?**
   If you say yes to public, the parade-day risk goes up materially and we ship fewer features
   solid.
2. **4-tab nav (Map · Group · Memory · Safety), with Tap folded into Map and Your Day inside Memory?**
   Confirm or push back; this is the IA shift that lets us add features without bloat.
3. **Media attachment in v1 memories — text-only confirmed.**
   Images/video move to v1.1 after the offline and relay core is proven.

Answer these and I lock the design; codex picks up the P0 list.
