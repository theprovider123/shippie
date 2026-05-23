# Parade Companion — Parade-Day Critical Plan

> Companion to all earlier parade docs. Reviewed against the goal flow:
> *load/save before parade → create group + share → friend joins (standalone too) → see offline map/GPS → tap "I'm here" / "bus is here" / report issue → group sees last-known locations when relay appears → all users see bus confidence when relay appears → safety stays one tap away*.
> Date: 2026-05-23. Parade: 2026-05-31 — **8 days out.**
> Constraint repeated: ~1M people, near-zero signal, must work flawlessly.

---

## 0. One-time-use parade cut

This is not a retention product. It is a disposable event instrument. Anything that does not help
someone **arrive, stay safe, find their group, spot the bus, or leave** is cut from parade-day v1.

**Keep for v1:**
- Offline readiness / saved-to-phone confirmation.
- Offline route map + GPS dot + accuracy radius.
- Safety / transport / exits / first-aid information.
- Group plan: primary meet, fallback meet, leave plan, invite QR/code.
- Group member last-known locations when opportunistic relay or QR sync works.
- Five fast report taps: `I'm here`, `Bus is here`, `Too crowded`, `Road blocked`, `Need help`.
- Bus confidence on the map: static schedule when offline, crowd pulse when relay appears.
- QR courier sync and opportunistic relay bursts as invisible accelerators.

**Cut from v1:**
- Memory tab, memory composer, group timeline, public wall, post-parade card, Your Day recap.
- Photos, video, voice, media sync, media moderation.
- Banter bingo, season moments, chant drawer, long copy, content feeds.
- Freeform group chat. Preset signals only.
- Wallet pass, Web Push, ultrasonic handshakes, AR pointer, PMTiles/MapLibre upgrade, time-machine.

**Final nav for v1:**

```
[ Map ] [ Group ] [ Safety ]
```

Map is the home screen and carries the action row: **I'm here · Bus here · Report**. Group carries
Plan + Members. Safety is always one tap away. No other screens.

---

## 1. Where we are today (committed: `644aa5f5`)

Branch `codex/parade-companion` is clean and committed. Baseline health green
(typecheck · 25/25 tests · build OK). What works against your flow:

| Flow step | Status | What's there |
|---|---|---|
| Load/save before parade | ✅ | `ReadinessChip` checks the cached basemap + route-pack + fonts; tells the user "Saved offline" or "Open on Wi-Fi to finish saving." |
| Create + share a group | ⚠️ partial | `PlanScreen` creates a **static** group plan (name, members, primary/fallback meeting points). Shares via QR + `#fragment` link. No live "group" — it's a snapshot. |
| Friend joins | ⚠️ partial | Hash decode triggers an import banner; saves the plan locally. No live join, no member roster, no presence. |
| Tap location / tap bus / report issue | ⚠️ partial | `PulseScreen` has 5 taps: *I'm here*, *Bus is here*, *Too crowded*, *Road blocked*, *Mark help spot*. Taps create local `fan_event` rows and sync only via manual QR. |
| Group sees your location | ❌ | No live relay. The group screen + `group-room.ts` were intentionally deleted. |
| All users see the bus | ❌ | No global broadcast. The `parade/bus-pulse` Worker endpoint + client were deleted. |
| Live interactive map | ⚠️ partial | `CorridorMap` is interactive (pan/zoom), shows your GPS dot + the route + your local fan-event clusters. Not live across users. |
| Group preset signals | ❌ | Does not exist. Recommendation below: preset-only, no freeform chat. |
| Non-critical social surfaces | ✂️ cut | Memory, timeline, public wall, card, media, chants, and banter surfaces are out of v1. |

**Read:** of your 9 flow steps, 1 is done, 4 are partial, 4 are missing.

---

## 2. The honest constraint (restated — this drives everything)

You've asked for "live like Waze, group signals" **and** "near-zero signal, 1M users,
flawless." Those don't both come for free.

**The model that does both: the degradation ladder.**

- **Tier 0 — Offline, always works (the core promise).**
  Map, GPS dot, plan, meeting points + compass, safety, your own taps, QR sync.
  No phone in the world needs network for Tier 0.
- **Tier 1 — Opportunistic relay, when *any* phone catches *any* signal.**
  Group member live dots, preset group signals, bus pulse. Each phone uploads + downloads when
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

- Every phone keeps a local outbound queue: group position snapshots, preset group signals,
  safety/route freshness checks, and bus sightings.
- When the browser sees `online`, or a relay request succeeds, it enters a short **burst window**
  (about 8-12 seconds). In that window it sends the smallest newest packets first:
  1. Safety/route-change ack + route-pack freshness check.
  2. Bus sightings.
  3. Group position.
  4. Preset group signals.
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
- No image/video upload during the parade.

This means even bad Wi-Fi can move useful state. One successful 2-second burst can update a group
and add a bus sighting to the global pulse.

### Relay topology

- **Group rooms:** encrypted per-group Durable Object. Only the group secret can read/decrypt.
- **Bus pulse:** anonymous route-segment aggregate. No identity, no raw public location feed.
- **Safety:** one-way broadcast / route-pack update check. This gets priority over everything else.
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

We currently have 6 nav tabs (Pulse · Map · Plan · Meet · Safety · Card). The one-time-use cut
collapses this to three screens only.

**Final bottom nav (3 tabs):**

```
[ Map ] [ Group ] [ Safety ]
```

Map carries the fast Pulse actions as a floating action row: **I'm here · Bus is here · Report**.
Group is one tab with two sub-tabs at top: **Plan · Members**. Preset group signals live inside
Members and the Map action sheet. There is no Memory screen in v1.

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
- **Group screen** with two sub-tabs (segmented control at top):
  - **Plan** (existing form, restyled)
  - **Members** (NEW — see Step 5)
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
- "Standalone environment" — clarify this rule throughout the UI: **your taps live on your phone
  first. They sync to your group only when relay or QR sync is available.** Make this visible in
  the first-run setup card and on the relay chip.

**Codex functional work:**
- Schema bump on the shared `#fragment` to include the room id + secret.
- A simple membership model: when relay is up, broadcasting your presence into the room adds you to
  the visible roster. No accounts; identity is the local `getFanSourceId()` + the display name.

---

### Step 4 — Tap your location · tap if you see the bus · report what matters
**Today:** `PulseScreen` has the 5 tap buttons.

**UI changes:**
- Keep the tap buttons (they are the fast, low-effort core).
- Fold them into the Map action row:
  - `I'm here`
  - `Bus is here`
  - `Too crowded`
  - `Road blocked`
  - `Need help`
- The Report sheet is just those five actions with large targets. No text field.
- After tap: small toast *"Saved on this phone. Syncs when signal appears."*
- The existing taps' status copy gets the same honesty pattern: *"Saved. Carries phone-to-phone by
  QR; syncs to the group automatically when signal returns."*

**Codex functional work:**
- No new composer or table. Use `fan_event` as the event log for taps/reports.
- Pruning: keep only recent parade-day `fan_event` rows needed for the map, QR courier, and relay
  queue.

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

### Step 8 — Group signals (preset only)
**Today:** Nothing.

**UI changes (Group → Members + Map action sheet):**
- Preset signals only:
  - `I'm here`
  - `Heading to meeting point`
  - `I saw the bus`
  - `Too crowded here`
  - `Leaving now`
  - `Need help`
- A compact recent-signals list inside Group → Members. Each signal:
  - Sender initials chip + name · age (*"2 min ago"*).
  - The signal body.
  - **Delivery status** as a tiny mono glyph: *●* sending · *✓* sent to relay · *⏳* queued offline
    · *!* failed.
- Empty state: *"Send quick signals to your group. They queue offline and sync when any phone
  catches signal."*
- Notification dot on the Group nav tab when there are unread signals.

**Scope note (v1):** preset signals only. No text chat, photos, videos, stickers, voice notes, or public posting.

**Codex functional work:**
- Same gossip room as group locations; signals are a payload variant. Encrypted end-to-end with
  the shared room secret.
- Local store: `group_signal` table; ordering by `created_at`; dedupe by id.
- Relay bursts prioritise safety/location signals.

---

### Step 9 — Cut social/content surfaces

**Decision:** no Memory tab, no public wall, no chant drawer, no banter content in v1.

The parade-day app should create fewer reasons to look at the phone, not more. The only "social"
surface is the practical group signal stream: where people are, whether they saw the bus, and
whether a location is too crowded or blocked.

**Codex functional work:** delete/avoid any new code paths for memory composer, timeline, public
posting, chant pack, media attachments, moderation queues, or post-parade recap. Keep the data model
to `fan_event`, `group_plan`, `group_member_presence`, and `group_signal`.

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
| **My phone storage is full** | App keeps only recent `fan_event` rows and warns if it cannot save a new tap/report. |
| **Battery low** | A small *"low battery — relay paused"* chip; relay throttles to a lower cadence; user can override. |
| **GPS accuracy is bad (> 350 m)** | Same guard as today: tap rejected with *"GPS is ±420 m — wait for a tighter fix."* |
| **Group member's last position is > 15 min old** | Member chip is dashed outline + name; map dot is outline-only with *"last seen 18 min ago"* label. Never a solid dot for stale data. |
| **Two members edit the plan at once** | Last-write-wins by timestamp; UI shows *"Plan updated by Sarah · 3 min ago"* banner; an *"undo"* if it was you. |
| **Joined the wrong group** | Group → Plan tab has a clear **Leave group** action (destructive confirm; explicitly says local copies of your taps stay on your phone). |
| **Lost the invite QR** | Group → Plan tab always shows the **room code** (mono caps) + a *"Show QR"* button — anyone in the group can re-invite. |
| **A peer tries to spam group signals** | Per-sender throttle (max 1 message / 2 s); the receiver UI shows *"slowing 'Tom' — too many messages"*; long-press a name → **Mute in this group** (local). |
| **Relay is unreachable** | Status chip → *Offline*; all sends queue; the UI never spins forever. |
| **Phone is shaken / dropped (accidental taps)** | The 5 Pulse taps have a brief (~120 ms) confirm-press window: a quick fill-up animation and a haptic; release inside the window posts. Lift early = nothing. |
| **Standalone vs group identity** | The topbar group badge tells the user whether they are in a group. Taps still save locally when no group exists. |

---

## 6. Moderation strategy

For v1 (this parade) — **no public posting and no freeform group chat**. Why:

- 1M public posters needs a real moderation pipeline. That is not parade-critical.
- Freeform text inside groups creates spam/moderation work and distracts from the street.
- Preset signals carry the useful intent without creating a content surface.

UI elements that exist for safety regardless:
- Per-sender **Mute in this group** for preset-signal spam (local).
- `Need help` copy says **"Saved and shared if signal appears. If this is urgent, call emergency
  services or find event staff."** Never imply the app summons help.
- A 3-line conduct/safety note in Group: *"Use this for your group. Do not publish personal
  information. Emergency help is not monitored here."*

---

## 7. Codex functional work list (what UI cannot do alone)

These are codex's tasks; UI specs above are mine. Severity for parade-day shipability.

**P0 (must ship for the flow to work)**
- Group **room model**: id + secret, generated on create, persisted alongside plan; extended in
  the shared `#fragment` payload.
- Reintroduce the **relay client** (`@shippie/spaces` gossip room) with encrypted payloads. Two
  group payload variants: position and preset signal. Bus sightings use the public bus pulse path.
- Add the **opportunistic relay queue** (§2a): local outbound queue, burst-sync ordering, relay
  health check, captive-portal detection, backoff, and calm `Offline/Queued/Syncing/Updated` chip.
- Lift `watchGps` to `App` (one source, one policy, shared `gpsFix`).
- **Bus pulse Worker + DO** + the bounded edge-cached aggregate read. (Reintroduce; was deleted.)

**P1**
- Group signal ordering, dedupe, throttle, mute-local list.
- Fan-event pruning and QR courier packet caps.
- Kill-switches: per-feature flags read from `shippie.json` or a small JSON in `runtime_assets`,
  so we can disable relay layers on the day if anything misbehaves.

**Explicitly out of v1**
- Memory composer, timeline, public wall, media, voice, chants, wallet pass, Web Push, ultrasonic,
  AR pointer, and PMTiles/MapLibre upgrade.

---

## 8. Phased plan (8 days to parade — aggressive, honest)

Today is **Sat 23 May**, parade is **Sun 31 May**.

| Day | Date | UI (me/Claude) | Codex |
|---|---|---|---|
| D-8 | Sat 23 | Three-tab shell; Group Plan/Members; Invite-screen design; group-badge in topbar | Branch off; relay client + room model |
| D-7 | Sun 24 | Members sub-tab UI; layer-toggle + follow controls on Map; relay status chip | Position publish/subscribe + throttle |
| D-6 | Mon 25 | Preset signal UI; delivery glyphs; empty state | Group signal payload over relay; dedupe/order/throttle |
| D-5 | Tue 26 | Report sheet polish; QR courier UX; queue/relay states | Fan-event pruning; shared packet envelope |
| D-4 | Wed 27 | Bus card on Map; bus-pulse layer styling; first-run setup card | Bus pulse Worker + DO + edge cache |
| D-3 | Thu 28 | Edge-case states (offline, no GPS, low battery, full storage, stale, queued, flagged); copy pass | Kill-switches; relay reconnect + backoff |
| D-2 | Fri 29 | Device matrix test + fixes (old iPhone Safari, A2HS, low-end Android) | Hardening; load test the Bus Pulse Worker |
| D-1 | Sat 30 | Final route-pack push; launch copy | Hot-fix window only |
| D-0 | Sun 31 | Monitor | Hot-fix window only |

**What's stretch:** nothing social. If we slip, cut preset group signals before cutting map, plan,
safety, or bus taps. The offline core (Tier 0) is already done and must never regress.

**Sequencing rule:** every day ends with `typecheck` + tests + build green. Feature flags off by
default for any P0 wiring that lands mid-stream.

---

## 9. The hard non-negotiables (carry into review)

1. **Tier 0 is sacred.** The map, GPS dot, plan, meet, safety, and your own taps *must
   work with the relay off entirely.* If a feature can break Tier 0, it's wrong.
2. **Every dot, every signal, every datum shows its age and source.** No silent live dots. Stale
   means visually different.
3. **No public posting in v1.** There is no timeline to moderate and no content feed to distract.
4. **Every relay feature is kill-switchable.** On parade day, if group signals misbehave, we
   disable them without redeploy while preserving bus taps, map, safety, and the offline core.
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
| **4-tab nav is still too busy for a one-time event.** | **Cut to 3 tabs — Map · Group · Safety.** Taps live on Map; plan/members/signals live in Group. |
| **Memory/social surfaces distract from the day.** | **Cut Memory, timeline, public wall, media, chants, and recap from v1.** Taps/reports are the only event capture. |
| **No bandwidth/cost playbook** — relay/DO costs at 1M aren't on paper. | Numbers + kill-switch order in §11c. |
| **Time sync across phones is implicit** — phones drift. | Every age label tolerant to ±60 s drift; never show seconds. "live · 2 min · 14 min · last seen 1 h." |
| **App updates during the event** can break SW caches. | **Version-pin during parade week** — service worker uses `skipWaiting: false` from 30 May 00:00 until 31 May 23:59. Users keep the version they had. A `morning-of` route-pack update is the only allowed change. |
| **Bus tap loss when phone dies** before any sync. | Solved by §11b QR courier sync — anyone who scanned you that day can re-spread your data. |
| **Tiny bits of Wi-Fi are underused.** | §2a turns weak connectivity into burst-sync windows: bus/safety/group packets move first, everything else waits. |
| **Moderation burden was creeping in.** | Remove the content surface. Preset signals only; no public posts. |

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

2. **Scheduled bus cue** — pre-baked into the route pack.
   The route pack carries only critical schedule cues, e.g. "bus expected near Holloway Rd at
   14:34." Every phone runs this locally. The UI can show one quiet full-screen line:
   *"Bus may be near. Look up."* No feed, no game, no extra content.

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
   the queue in priority order: safety/route freshness, bus, group position, preset group signals.
   This turns scraps of Wi-Fi into meaningful state transfer while preserving the offline-first
   promise. The UI says *"Syncing..."* and then *"Updated 2 min ago"*; it never blocks a core screen.

Everything else in the earlier brainstorm — Web Push, on-device moderation, Wallet pass, voice,
ultrasonic, AR, public wall — is cut from v1. Good ideas later; not parade-day critical.

### 11c. Bandwidth / cost playbook (the "what if it gets hot")

Honest scaling math for 1M concurrent users over a 3-hour window, all on Cloudflare's edge.

| Surface | Volume | Mitigation | Kill order if it overheats |
|---|---|---|---|
| Static assets (app, basemap, fonts) | one-time + cache | Edge cache, immutable hashes | n/a (cache hit) |
| Route-pack JSON | rare reads | 5-min edge TTL, ~5 KB | n/a |
| Bus Pulse aggregate read | huge — 1M phones polling every 30 s = 33k rps | **10–30 s edge cache → ~1 origin hit per cache window per data centre.** Worst case ~500 origin rps. | **last to disable** |
| Group position broadcast (per room) | 6 members × 1 per 30 s = 0.2 rps per room. 150k rooms = 30k rps spread across DOs. | One DO per room; throttle 1 / 30 s; binary payload (~30 B). | **first to throttle (60 s); then 90 s; then disable** |
| Relay burst windows | bursty at Wi-Fi edges | 8-12 s window, priority queue, exponential backoff, max one room subscription per app session. | **shorten burst window; then group-only; then bus/safety only** |
| Group signals (per room) | bursty, but per-room. | Same DO; preset signals only; rate-limit per sender 1 / 2 s. | **second to disable** |

**Kill-switch playbook (manual lever, no redeploy):**
1. Throttle group position broadcasts (60 → 90 → 120 s cadence).
2. Disable preset group signals.
3. Disable group position entirely (Members goes to "last known" only).
4. Bus Pulse remains until last — it's the most valuable broadcast feature and the cheapest to serve.
5. Offline core never depends on any of the above — it just keeps working.

### 11d. Event energy that survives the cut

The bar is now **useful first**. Keep only the energy that also helps someone on the day.

- **The scheduled bus cue** (§11b#2). Pre-shared schedule; one prompt to look up.
- **The QR courier spread of bus sightings** (§11b#1). Your friend brings you updates from across the route.
- **The relay breath.** Someone catches a few seconds of pub Wi-Fi and the whole group quietly catches up.
- **The group's first reunion ping.** When your group's roster is all-green for the first time (everyone has caught signal), a small italic line crosses the top: *"All five of you, here."* A tiny social moment.

### 11e. Operational concerns the user needs to own

Code can't solve these — they're partnerships and logistics.

- **5–10 pub hubs along the route** (§11b#3). Need outreach this week. 8 days is tight; even 2 would matter.
- **5–10 anchor phones** with organizer accounts (§11b#4). Needs people willing to walk the route or stand at known spots with a power bank.
- **A morning-of "is the route changed?" check** with Islington Council / Met Police press desk. The route-pack push is the corrective lever.
- **A no-publish bargain.** No global wall in v1. If the press asks "where's the public wall?", the answer is *"This app is for being there, not posting from it."*

### 11f. Updated phasing impact

Add to the schedule in §8:

- **Day D-8 (today):** also start operational outreach — pub hubs, anchor phones.
- **Day D-7:** route-pack safety/transport update path; first scheduled-bus-cue test.
- **Day D-6:** extend QR courier payload (cheap — schema change in `encodeFanEventsForSync`) and add relay burst queue.
- **Day D-5:** Predicted-bus band on the Map (no new data, just a rendering change).
- **Day D-4:** Three-tab IA hardening; no non-critical screens.
- **Day D-3:** Freeze the SW version.
- **Post-parade:** evaluate ideas only after the v1 field test.

### 11g. Updated decisions in §12

The flaw-fix changes one of the decisions; the others stand:

- **Nav:** **3 tabs (Map · Group · Safety)** with Pulse-as-FAB on Map.
- **Memories/content:** cut from v1.
- **Timeline scope:** no timeline in v1.

---

## 12. Decisions for you (gate the build)

1. **3-tab nav is locked:** Map · Group · Safety.
2. **No content surfaces in v1:** no Memory, no Card, no public wall, no chants, no banter feed.
3. **Preset-only group signals:** no freeform chat.

Codex should now build the minimum parade-day instrument, not the richer event-social product.

---

## 13. Map + GPS pointer — ground-up deep dive

> Focused addendum for codex. The map and the GPS-pointer (the Meet-screen compass arrow) are the two
> interactions the user has flagged as the highest-priority innovation surface. Treat this section as
> the spec for those two surfaces. Everything here slots into the existing architecture; nothing
> requires throwing work away.

### 13a. How maps work in a phone browser (the honest review)

There are five approaches; only the right combination delivers offline + interactive + beautiful + fast on a 2017 phone.

| Approach | What it is | Pros | Cons | Fit |
|---|---|---|---|---|
| **Static raster** (current `corridor.webp`) | One pre-rendered image at a fixed extent | Tiniest, simplest, no library | Pinch-zoom is just bitmap scaling; fixed extent; not re-styleable | Works, but flat. |
| **Tiled raster** (Z/X/Y PNG/WebP) | A grid of pre-rendered images, one per zoom level | Real zoom, well-known | Tile server or pre-baked tiles; cache footprint balloons | OK if we bake tiles, but heavier than needed. |
| **Vector tiles via PMTiles + MapLibre GL JS** | Single-file vector tile archive served via HTTP range requests; MapLibre renders with WebGL | True quality offline; one file; **re-styleable in our paper palette**; pinch to street level; ~5–15 MB for central Islington | ~200 KB gz JS dependency; iOS Safari < 16 edge cases | Good later, cut from v1. |
| **Canvas-drawn vector** | Our own `CorridorMap` overlay — route, dots, fan events | Tiny, fast for small data, exact control | Re-implementing everything would be huge | Keep this for our overlay layer. |
| **Custom WebGL** (deck.gl, etc.) | Bring-your-own renderer | Maximum control | Big bundle; we'd write all the map UX ourselves | Overkill. |

**The parade-day combo for us: keep the current static raster/canvas map and harden the overlay.**
The route, GPS dot, accuracy radius, group dots, reports, and bus confidence matter more than a
basemap upgrade. MapLibre/PMTiles is explicitly post-parade.

Why not upgrade now:
- A new map stack adds WebGL, worker, file-size, and offline-cache risk.
- The route corridor is fixed and already cached.
- Users need a reliable route, dot, reports, and bus confidence more than street-level polish.

### 13b. Browser realities to design around (the constraints)

- **GPS works without internet** (it's a receive-only satellite signal). Already a strength.
- **Cold GPS fix in an urban canyon: 30–90 s; accuracy 50–100 m.** Plan for it; show the radius.
- **A-GPS (assisted GPS) speeds the first fix dramatically when *any* signal exists** — that's why our `warmUp()` call before parade day is so cheap and so high-leverage.
- **`navigator.geolocation.watchPosition` does not run when the tab is backgrounded.** No browser does background GPS. The app must be foregrounded for live dot motion.
- **`DeviceOrientation` requires `requestPermission()` on iOS Safari, via user gesture.** Already handled in `compass.ts`.
- **iOS gives true heading via `webkitCompassHeading`**; Android gives `alpha` (relative to magnetic north or device alignment depending on `absolute` flag) — we must read both.
- **`DeviceMotion` gives accelerometer + gyroscope** with permission; opens the door to sensor fusion.
- **iOS Safari aggressive cache eviction (~7 days idle)** — our service worker + `runtime_assets` precache already handles this.
- **`OffscreenCanvas` is supported in modern browsers** (iOS Safari 16.4+); falls back to main-thread canvas where not.
- **No background sync of dots.** When the user pockets the phone, GPS pauses. That's the medium.
- **Magnetic interference is real in a crowd of phones** — heading is noisy; we MUST filter.
- **`navigator.vibrate` is well-supported on Android, ignored on iOS Safari.** Plan accordingly: visual + haptic both, never haptic-only.

### 13c. Performance principles (non-negotiable for parade day)

- Pan via `transform: translate3d(x, y, 0)` on a GPU layer (we do this).
- All draw inside `requestAnimationFrame`; never `setInterval`.
- Throttle `pointermove` to ~60 Hz; use `passive: true` listeners.
- `will-change: transform` on the world layer; remove it when idle.
- **Diff renders**: when only the GPS dot moved, don't clear and redraw the route+POIs — invalidate the dot region.
- Move clustering and fan-event draw to an `OffscreenCanvas` worker where available.
- Throttle GPS broadcasts to ≤ 1 / 30 s; smoothing fills the visual gap (§13e).
- Never animate a fake position. The user always sees the truth + the confidence (the accuracy radius).

### 13d. Map innovations — ranked for our context

The bar isn't "useful" — it's *"only this map, this day, this place."* Picked the ones that fit the medium.

**For v1 (parade day — only land these)**

1. **Current raster/canvas map, fully offline.**
   Do not replace the basemap before the parade. Make the current map robust.
2. **GPS dot with honest accuracy radius.**
   The dot can be useful even when the radius is wide; never fake precision.
3. **Meeting-point pointer.**
   One clear arrow to the primary meeting point, with fallback meeting point one tap away.
4. **Group dots when relay/QR data exists.**
   Age-stamped, faded when stale.
5. **Bus confidence band.**
   Static schedule offline; crowd pulse only when relay appears.
6. **Layer toggle.**
   Group · Bus · Reports · My taps. No hidden complexity.

**Cut from v1 (evaluate after the parade)**

7. Vector basemap / PMTiles / MapLibre.
8. Auto-rotate map.
9. Sensor-fused dead reckoning.
10. AR pointer mode.
11. Crowd-density replay/time-machine.
12. 3D needle.
13. WebTransport/WebRTC LAN sync.

### 13e. GPS pointer — parade-day scope

The current state (`screens/MeetScreen.tsx` + `lib/compass.ts`): a single Arsenal-red arrow inside
an 84×84 ring, rotated from `relativeBearing(targetBearing, headingDeg)`. iOS permission is gated
correctly. One target: the primary meeting point. Distance + countdown below.

**Keep for v1:**
- Primary meeting-point arrow.
- Fallback meeting-point swap.
- Distance, ETA, accuracy, and fix age.
- Clear "enable compass" / "GPS off" states.
- Battery-saver mode that lowers GPS cadence.

**Cut from v1:**
- Sensor fusion / dead reckoning.
- Auto-rotate map.
- Multi-target ghost arrows.
- Haptic distance pulse.
- Audio chime / voice cue.
- Wallet pass.

The pointer should be boringly trustworthy. A simple arrow that admits uncertainty is better than
an impressive arrow that lies.

### 13f. Pointer — edge cases

- **No compass permission granted** → fall back to *"absolute north"* arrow + a "Tap to enable compass" affordance. User rotates the phone themselves.
- **Magnetometer unavailable** → same fallback; the walking-direction arrow becomes primary when the user is moving.
- **GPS lost mid-flow** → freeze the arrow but show *"GPS lost — last seen 14 s ago"*. Never animate a fake position.
- **Target moved** → smooth eased rotation, never a snap. Brief pulse on the ghost chip that moved.
- **Phone upside-down or sideways** → orientation still publishes; if the reading is unstable, show
  the calibration/uncertain state rather than pretending.
- **Compass is wildly wrong** (the calibration interstitial) → don't show the arrow until variance drops; show the calibration prompt instead.
- **All targets too far** (> 5 km, sanity check) → "All targets are very far away — check your group plan?" copy.
- **Phone goes to sleep** → on resume, run a fresh `getCurrentPosition` before rendering the arrow; never show a 20-min-old fix as live.

### 13g. The map — edge cases

- **Basemap fails to load** → fall back to `corridor.webp` and keep the route overlay visible.
- **GPS denied** → map shows *"GPS off — turn on Location to share your dot"* over a static centred view of the corridor.
- **Map asked to render with a vast accuracy radius (> 1 km)** → cap the visible radius and add a *"poor GPS — finding you…"* label.
- **Phone is moving fast** (in a car/train passing near) → don't auto-rotate the map (heading would spin); show *"moving fast — auto-rotate paused"*.
- **Two simultaneous pinches** → ignore the second pointer cluster gracefully.
- **Layer toggles all off** → still show the GPS dot + the route; the layers control everything else.

### 13h. Handover to codex — concrete tasks

**P0 (parade day only)**

| Task | Touches | Notes |
|---|---|---|
| Single shared GPS source (S2 from simplification plan) | `App.tsx` + Map/Pulse/Meet | Lift `watchGps` to App; pass `gpsFix` + a battery toggle. One subscription per session. |
| Meeting-point pointer | `screens/MeetScreen.tsx` | Primary/fallback target only; no AR, no voice, no haptic distance pulse. |
| Map report overlay | `components/CorridorMap.tsx` | Draw local reports + group dots + bus band with age labels. |
| Battery-saver map mode | `App.tsx` + map screens | Lower GPS cadence; no extra animation loops. |

**Explicitly cut from v1**

- AR pointer mode (`getUserMedia` + overlay).
- Time-machine slider for the map.
- 3D needle (gyroscope rendering).
- OffscreenCanvas worker for overlay.
- PMTiles regional prefetch by group plan.
- WebTransport / WebRTC datachannel for LAN-local sync.
- Auto-rotate, sensor fusion, voice cues, audio chimes, wallet pass.

### 13i. Hard rules

1. **The pointer never moves without a real reading.** Animations are easing, not invention.
2. **Every dot, every arrow, always shows age + confidence.** No silent "live" data.
3. **Battery mode (pointer-only) exists and is one tap away.** The long tail of the parade is a battery problem; this is the answer to it.
4. **No basemap upgrade in v1.** Reliability beats visual ambition here.
5. **None of this depends on internet after first cache.** Pointer, route, GPS, reports, and safety
   all work client-side.
6. **The design system holds.** Paper / Arsenal red / mono-for-data / sharp corners / Fraunces italic.
