# Shippie Docklands - Showcase Game Design Spec

> **⚠️ Loop superseded — read the survival revision first:** `2026-06-02-docklands-survival-revision.md` ("Tide Siege"). The core loop is now **round-based survival** (PG-13 COD-Zombies on your dock): alternating **PREP** (spend earnings, build, position crew) and **DEFEND** (escalating rounds), crew-as-controllable-units with down/revive, a per-round economy, buildables with feature-sets, three map themes, and a "how many rounds did your dock survive?" hook. Everything below stays valid (room, Beacon, crew, friendly-junk framing, co-op embodiment, Shippie proof) **except** the loop framing in §6–§7, which the revision replaces. Canonical mockup: `docklands-mockups/docklands-survival.html`.
>
> **Status:** Draft v1, 2026-06-02.
>
> **Goal:** Specify one viral, local-first, shareable, real-time capable showcase game that proves Shippie can host a social world, not just single-purpose tools. The game borrows the durable lessons of Habbo Hotel and The Sims without copying their setting, economy, or safety problems.

---

## 1. Short thesis

**Shippie Docklands** is an isometric social life-defense RPG about a room that comes alive by day and fights back at night.

Every player owns a floating dockhouse built around a glowing **Beacon**. By day it is a cozy room: decorate it, craft furniture, customize your captain, care for your crew, collect trophies, and host friends. When the Tide rolls in, the same furniture unfolds into defenses, the floor path lights up, and the room becomes a 3-minute co-op defense puzzle. Friends can dock in live, or play your room later as an offline "beat my tide" challenge.

The game should make sense instantly:

> Your room is your base. Your furniture fights. Your friends can dock in.

The game proves Shippie because the same room can be:

| Mode | What the player experiences | Shippie primitive exercised |
|---|---|---|
| Offline | Build a room, simulate life, test waves, progress crew | Local capsule, OPFS/IDB, deterministic sim |
| Local | Two tabs/devices join from a code and play together nearby | Proximity groups, Yjs shared state, QR |
| Shareable | Export a room postcard/challenge that another person can open | Signed share package, portable app data |
| Real time | Guests move, emote, place allowed objects, and defend together | SignalRoom/WebRTC/gossip, presence |
| Syncable | Room state and replay receipts sync across devices later | Sealed checkpoints/private spaces |
| Auditable | The room can show what left the device | Trust Ledger and bridge-gated egress |
| Cross-app | Other arcade achievements become trophies/furniture | `game.completed`, `wave.cleared`, future observations |

The public pitch should stay grounded and game-first:

> Build a room that fights back.

Internal framing: this is the first "Shippie OS" game because it makes Shippie feel like an environment where local apps, rooms, identities, files, sync, trust, and friends compose.

---

## 4. Game concept

### 4.1 Name

Working title: **Shippie Docklands**.

Public short title: **Docklands**.

Optional subtitle for trailers/specs: **Beacon Tide**.

Slug: `docklands`.

Alternate names held in reserve:

| Name | Note |
|---|---|
| Shippie Harbor | Clearer, less distinctive |
| Dockhouse | Cozy, smaller scope |
| Tide Rooms | More gamey, less Shippie |
| Portside | Good vibe, weaker viral command |
| Shippie Commons | Social-first, less game-first |

Recommendation: keep `Docklands`. It avoids "hotel", signals Shippie, supports rooms/ships/neighborhoods, and makes "come to my dock" a natural share phrase.

### 4.2 One-sentence pitch

Build a floating room around a glowing Beacon, raise a tiny crew, and watch your furniture unfold into defenses when friends dock in for the Tide.

**Kid-sentence (the version a 10-year-old repeats):**

> **Build a room. Protect the light. Beat the wave.**

This three-beat line is the load-bearing pitch for onboarding, the store listing, and the share card. The one-sentence pitch above is the adult version; the kid-sentence is what the game must teach in its first ten seconds (see §6.0.1).

### 4.2.1 Two vocabularies (catalog name ↔ kid word)

Every core noun has a flavour/catalog name *and* a plain word. The plain word is what the first-run UI, coach bubbles, and goal pill use; the catalog name appears later in tooltips, the blueprint shelf, and this spec. They are the same thing — never a third synonym.

| Catalog / flavour name | Kid word (first-run UI) | Notes |
|---|---|---|
| Beacon (a.k.a. Beacon Core) | **the Beacon** / **the light** | The protected object. Always "Beacon", never "core" in player-facing copy. |
| Bell Turret | **zapper** | The starter defense. "zapper" in the build coach; "Bell Turret" in the blueprint catalog. |
| Drift | **the gunk** | Washed-in junk you *clear*, not creatures you kill (§4.3, §8.3). Friendly framing: googly-eyed clutter-blobs. "Drift" is lore; first-run says "gunk". |
| Crew tool | **gear** (per tool: hammer, horn, flare, gauntlet) | Friendly tools that double as defenses — never "weapons" in player copy (§8.2.1). |
| Beacon Lens | **lens** | Slot-in upgrade gem for the Beacon (§8.1.1). |
| Beacon charge | **power** | The Beacon's energy meter; spent on the Pulse and abilities (§8.1.1). |
| Beacon Pulse | **the big push** | Host-fired shockwave that shoves all gunk back to the gates. |
| Tide (wave event) | **the Tide** | Kept as-is — short, themed, kid-legible. The Start button sends it. |
| Salvage / Spark | (hidden first run) → **coins** / **energy** | Economy terms stay off-screen until after the first win. |
| Replay receipt / capsule | **share card** | Surfaced only at the share moment. |

### 4.3 The fantasy

You are a captain in a reclaimed floating neighborhood. Every dockhouse is a little isometric room built around a living **Beacon** — a growing lighthouse-lantern that is part hearth, part save file, part room heart (§8.1.1). Your **crew** lives there, crafts there, hosts friends there, and grabs their tools to clear the room when **the gunk** — washed-in tidal junk called **Drift** — drifts through the gates toward the light.

Nobody gets hurt. The Drift is *clutter that needs clearing*, not creatures to kill: bottles, rust, kelp, fog — junk that's drifted a little to life with googly eyes. Crew tools are **friendly gear** (a rivet hammer, a signal horn, a flare, a spark gauntlet), not weapons. The fantasy is *protecting and tidying your home*, not combat — which keeps Docklands cozy, kid-safe, and parent-safe.

The room is both Sims house and tower-defense map, and the **crew are its heart** — you *command* them solo, and in co-op your friends *become* them (§8.2.1):

- beds, kitchens, workbenches, lamps, plants, chairs, posters, and trophies keep the crew happy — and **happy crew clear gunk faster** (§8.4.2)
- walls, crates, piers, doors, and bridges shape the gunk's path inward toward the Beacon
- crew with upgradeable gear + turrets (zappers, nets, coils, decoys, repair drones) clear the dock
- friends scan in to **be your crew** — run the room, swing a tool, charge the Beacon — then leave with a blueprint of their own

### 4.3.1 Refined premise

The premise should be explainable from a screenshot:

> There is a room. There is a growing Beacon. The gunk is washing in. Your crew grabs their gear, and the furniture unfolds to help.

The loop:

| Moment | What happens | Emotional job |
|---|---|---|
| Day | Build, decorate, craft, assign crew, customize captain, host visitors. | "This is mine." |
| Tide warning | The water rises, path lights turn on, furniture unfolds, crew runs to stations. | "My room is alive." |
| Tide | The gunk drifts the route toward the Beacon; crew grab gear and clear it; guest-crew help live. | "We can save it." |
| Afterglow | The room keeps scars, rewards, stamps, trophies, and replay receipts. | "That story happened here." |
| Share | The room becomes a postcard, capsule, join code, or challenge. | "Try my room." |

The first 30 seconds should not require lore. Lore can deepen later through crew quests and neighborhood restoration.

### 4.4 Genre blend

| Source love | Docklands expression |
|---|---|
| Habbo | Isometric rooms, avatar presence, chat bubbles, room identity, badges, guestbook, room games |
| The Sims | Crew needs, relationships, routines, home-building, live-mode simulation, cozy chaos |
| Tower defense | Player-built pathing, waves, traps, turrets, upgrades, deterministic replays |
| RPG | Crew classes, skills, equipment, quests, room reputation, unlock trees |
| Social party game | Join-code events, room raids, emotes, co-op roles, shareable snapshots |
| Idle/crafting | Offline crew jobs, crafting timers, blueprint research, repair cycles |
| Roguelite challenge | Daily tide seed, modifiers, replay receipts, "beat my room" challenges |

---

## 5. Design pillars

1. **The room is the game.** No separate battle arena. Decorations, furniture, paths, crew needs, and defenses all use the same grid.
2. **Offline is real.** A solo player can build, live, upgrade, and run waves with no network after install.
3. **Presence changes the room.** When friends join, the room feels alive: avatars arrive at the dock, chat bubbles appear, roles light up, co-op actions matter.
4. **Share creates play, not just marketing.** Every share is a playable room capsule, defense challenge, replay, blueprint, or event invite.
5. **Earned objects beat paid rarity.** Status comes from craft, skill, participation, and history.
6. **Trust is visible.** Sync, invites, telemetry, and multiplayer egress are readable by the player.
7. **Small world, deep verbs.** First slice is one room, a handful of crew traits, and a tight wave system.

### 5.1 Full feature catalog

| Feature | First slice | Later expansion |
|---|---|---|
| Captain creator | Body, face, hair, outfit, gear, emotes, name, trait | room-title badges, deeper animation packs |
| Crew household | 3 fixed crew, 5 needs, role stations | recruitable crew, deeper relationships, visitors |
| Room builder | 10x10 grid, place/move/rotate, path preview | larger docks, multiple rooms, room templates |
| Furniture | 20 launch blueprints across utility/social/defense/trophy | seasonal sets, user-authored blueprints |
| Life simulation | needs tick, routines, small room problems | storylets, careers, visitor requests |
| Tower defense | 5-wave starter campaign, deterministic replay | daily seeds, bosses, modifiers, co-op raids |
| Upgrades | crew level 1-3, defense item upgrades, room reputation | branching skill trees, prestige room styles |
| Live room | join code, 2-4 players, presence, emotes, one co-op wave | neighborhood events, spectator mode |
| Async challenge | beat-my-tide capsule and replay receipt | challenge leagues, remixable room seeds |
| Guestbook | signed visit/replay/gift entries | wall placement, reactions, guestbook filters |
| Sharing | room postcard, QR, signed capsule | video-like replay card, app-store showcase embeds |
| Cross-app trophies | consume existing arcade observations | richer trophy metadata and sibling-app quests |
| Trust surface | redacted rows for share/live/intents | in-room trust timeline and revoke affordances |
| Safety | invite-only, host mute/kick/lock, no public chat | opt-in neighborhoods and device trust lists |

### 5.2 Feature promise by player horizon

| Horizon | Player promise | Required systems |
|---|---|---|
| First minute | "This is my tiny dock." | captain setup, starter room, save |
| First 10 minutes | "I built something and defended it." | builder, pathing, first wave, reward |
| First share | "Try my room." | postcard, beat-my-tide capsule, import |
| First friend | "We were in the same room." | join code, presence, emotes, host controls |
| First week | "My dock has history." | guestbook, trophies, crew upgrades, event seeds |
| First month | "This is my Shippie home." | cross-app trophies, sealed sync, room reputation |

### 5.3 Screen inventory

| Screen/surface | Purpose | Key controls |
|---|---|---|
| Captain setup | Create identity without account friction | name, color, trait, start |
| Dock room | Primary playable workspace | pan/zoom, select item, crew tap, mode rail |
| Build tray | Place and rearrange objects | category tabs, object palette, rotate, confirm |
| Item inspector | Upgrade/configure selected furniture | move, rotate, upgrade, sell/store, permissions |
| Crew sheet | Sims-like household view | needs, roles, assign station, upgrade |
| Tide panel | Start/preview defense wave | seed, wave details, start, speed, replay |
| Live room sheet | Open or join a room | QR, join code, guests, revoke, chat mode |
| Guest view | Visitor-focused room mode | role pick, emotes, guestbook, leave |
| Share sheet | Turn room state into a playable object | postcard, beat-my-tide, blueprint gift, copy link |
| Guestbook | Social memory and proof | entries, receipts, gifts, trust rows |
| Trophy wall | Cross-app achievement home | trophies, source app, place in room |
| Safe/private settings | Trust and safety controls | room privacy, chat mode, export/delete data |

### 5.4 Primary verbs

The game should keep the verb set small and physical:

- **Place** furniture.
- **Route** the gunk's path.
- **Command** crew (solo) / **Embody** a crew member (co-op).
- **Arm** crew — upgrade their gear and fire tools/ultimates.
- **Charge & Pulse** the Beacon.
- **Open** the dock to guests.
- **Clear** the gunk.
- **Gift** a blueprint.
- **Stamp** the guestbook.
- **Share** a challenge.
- **Inspect** what left the device.

Anything that does not map to one of these verbs is likely expansion scope.

---

## 6. First player experience

### 6.0 First five seconds

The first screen must teach the game with objects, not a tutorial modal:

1. The camera lands on the player's room.
2. The glowing Beacon pulses **dead-center in the room** — the brightest thing on screen (see §6.0.2). It is the literal middle of the grid, not a base at the path's end.
3. The Tide Gates blink at the room's edges; the route(s) light up for one second, all converging *inward* toward the Beacon.
4. A bed, crate wall, workbench, and Bell Turret each unfold once to show that furniture has jobs.
5. The captain and crew walk in from the gangway.
6. The bottom rail shows the verbs, but only **Build** and **▶ Start** read as actionable on first load (§6.0.1).

If the player has never heard the premise, they should still infer: "I build this room, protect that light, and can invite people."

### 6.0.1 The 10-year-old test (no-reading onboarding)

A 10-year-old will never read this spec, a tutorial modal, or a tooltip. The game must teach itself through five rules. These are demonstrated working in `docs/superpowers/specs/docklands-mockups/docklands-canvas.html`:

1. **One always-on goal, three words.** A persistent pill reads **"Protect the Beacon"** with three **♥ hearts** beside it. It never disappears, never scrolls away, and is the first thing the eye lands on. The aim is legible before any verb is understood.

2. **The Beacon is the obvious protected object.** It is the brightest thing on screen — a pulsing light with a vertical beam and its hearts floating directly above it, labelled "Beacon." When it is hurt, the hearts deplete *both* on the goal pill and over the Beacon itself, and its glow turns from gold to red and pulses faster. A child reads "that thing is in danger" without a single word.

3. **The first action is shown, not told.** On first load, a pointing-finger coach bubble sits over one glowing target tile: *"Tap the glowing tile to build a zapper."* That is the only interactive prompt; everything else recedes. After the player places one zapper, the coach jumps to the Start button: *"Now press ▶ Start to send the Tide."* The entire tutorial is **two taps** — build one thing, start the wave. (Reduced from the four placements in §6.1; the bed/workbench/crate-wall are introduced *after* the first win, not before it.)

4. **The path is the answer to "what do I do?"** Monsters ride the Tide along a single glowing path toward the Beacon. The visible lit line tells the player where danger comes from and where to put zappers. Pathing legibility is the whole game's teachability — if a child can see the line, they understand the spatial puzzle without instruction.

5. **Win and lose are unmistakable and kind.** A wave ends with a full-screen card: **"Beacon safe!"** with one to three ⭐ (earned per surviving heart), or **"The Tide got in!"** with a single *Try again* button that resets the hearts. No score spreadsheet, no punishment, no dead-end — Bloons-style "lose a heart, keep playing," and a one-tap retry. A 3·2·1·GO countdown precedes every wave so the player is never surprised.

**De-jargon the core loop for the first session.** Words like *salvage, spark, receipt, Trust Ledger, capsule, deterministic* are real systems but invisible to a beginner. The first-run vocabulary is only: **Beacon, hearts, zapper, gunk, the Tide, Build, Start.** Economy and proof language surface later, once the loop is understood.

**Verb discipline on first load.** §6.0 lists the rail verbs. For a true first run, only two need to *read as actionable*: **Build** (pressed by default) and **▶ Start**. Crew / Look / Open / Share stay visible but quiet until the first Tide is survived — fewer choices, clearer aim.

### 6.0.2 Room layout: Beacon-centered (canonical)

Earlier drafts described the Beacon "at the back of the route" — a classic tower-defense base at the path's end (Bloons, Kingdom Rush). That is easy to build but contradicts the thesis ("protect the glowing Beacon **in the middle of the room**") and the room-as-identity fantasy. The canonical model is:

- **The Beacon sits dead-center of the grid.** It is the room's heart — what your furniture is arranged *around*, not a corner objective.
- **Tides enter from one or more edge Gates and path *inward* toward the center.** Early waves use a single gate; later waves and bigger rooms open additional gates from other edges, so the player must defend more than one approach. This is the natural difficulty ramp and the reason the room layout itself is the strategy.
- **Why this is better for the 10-year-old test:** a thing in the middle that everything walks *toward* reads instantly as "the precious thing." A base tucked in a corner reads as a generic endpoint. Center-out also makes the day room (cozy, furniture around the hearth) and the Tide room (the same hearth under siege) the *same* composition in two states — the day/night transformation lands harder.
- **Trade-off acknowledged:** center-out pathing with multiple gates is more pathfinding and balance work than a single fixed lane. Accepted — it is the distinctive core, not optional polish.

Two mockups demonstrate the contrast: `docklands-canvas.html` (single lane, base-at-end — the quick-to-build baseline) and `docklands-canvas-center.html` (Beacon dead-center, gates converging inward — the canonical model).

### 6.1 First 10 minutes

1. Player chooses a captain name, color, and starting trait.
2. Player gets a 10x10 starter dock with four crew members, each with a tool (§8.2.1):
   - **Mira**: builder, rivet hammer (repairs + knockback)
   - **Penn**: host, signal horn (buffs + stun cone)
   - **Jax**: tactician, flare (marks gunk for focus-fire)
   - **Sol**: charger, spark gauntlet (refills Beacon power)
3. Guided first action — **one** placement only: drop a single **Bell Turret (zapper)** on the glowing target tile beside the path (the two-tap onboarding from §6.0.1).
4. A tiny first wave (3–4 slow bits of gunk) drifts in through the Tide Gate and follows the lit path; the lone zapper clears it. Player sees cause and effect: *I built that, it protected the Beacon.*
5. Player wins a **Brass Lantern** blueprint and the **"Beacon safe! ⭐⭐⭐"** card.
6. *Now* the game opens up: it invites the player to make the dock feel like home — place a bed, workbench, and crate wall — and explains each gives crew jobs and reshapes the path for the next, larger Tide.
7. The lantern goes on the wall and becomes a shareable postcard moment.
8. CTA: "Open the dock" creates a QR/join code for co-op or a share link for async challenge.

### 6.2 First session success moment

The player should be able to send this within 15 minutes:

> I built my dock. Try to survive Wave 3.

The link opens a signed snapshot of the room and lets the recipient run the same deterministic wave offline. If both players are online, it becomes a live co-op room.

---

## 7. Core game loops

### 7.1 Solo offline loop

1. Check crew mood and room status.
2. Place or rearrange furniture.
3. Start a seeded tide wave.
4. Earn salvage, XP, blueprint fragments, and room reputation.
5. Upgrade a crew skill or furniture piece.
6. Save a postcard or challenge capsule.

### 7.2 Sims-like life loop

1. Crew wakes, works, rests, socializes, and reacts to the room.
2. Needs drift over time: comfort, morale, spark, grit, safety.
3. Furniture affects needs and wave performance.
4. Crew relationships unlock small perks.
5. Problems appear: broken pump, messy galley, low morale, visitor request.
6. Player chooses what to fix before opening the room or starting the next wave.

### 7.3 Live social loop

1. Host taps "Open dock" (capacity gated by Beacon stage, §8.1.1d).
2. Shippie creates a join code/QR and live room.
3. Each guest device **picks an available crew body and embodies it** (§8.2.2) — they are now Mira/Penn/Jax/Sol, not a spectator avatar.
4. Asymmetric play: the **host** builds, owns the Beacon, and fires the Pulse; **guest-crew** run the room with their gear — Mira repairs/bashes, Penn horns, Jax marks, Sol charges — and trigger their own ultimates.
5. Host previews the Tide manifest and starts it; the group clears the gunk together.
6. Replay receipts are signed (guest intents resolved on the host engine, so the receipt still validates).
7. Visitors leave guestbook stamps and **take home a copy of one blueprint they helped earn** — the viral seed (§8.2.2).

### 7.4 Async viral loop

1. Player exports "Beat my tide" capsule.
2. Friend opens it offline or in their Shippie install.
3. Friend runs the same seed against the room snapshot.
4. Friend sends back a signed replay receipt.
5. Owner's guestbook shows the result and optionally unlocks a room prop.

This loop matters because it works even when friends are not online at the same time.

### 7.5 Cross-app loop

Docklands consumes existing arcade observations:

- `game.completed` becomes a trophy shelf item for that game.
- `wave.cleared` from Bulwark can unlock a "Bulwark Pennant" wall item.
- Future `puzzle.cleared` can unlock puzzle posters or crew focus buffs.

Docklands provides:

- `game.completed`
- `wave.cleared`
- proposed `docklands.room_opened`
- proposed `docklands.blueprint_gifted`
- proposed `docklands.guestbook_signed`

The game becomes the visible "home" for Shippie-wide achievements without creating a central user-data store.

---

## 8. Systems

### 8.0 Identity and full character customization

Docklands needs a proper character creator. Habbo's avatar identity was sticky because the character was visible everywhere; The Sims works because player expression starts before the house. Docklands should combine both:

- a player captain that represents the device/profile
- crew members that can be dressed and personalized
- guest avatars that carry signed display identity into live rooms
- customization data that is portable with room capsules where the user allows it

#### 8.0.1 Avatar model

Use a modular 2.5D/isometric sprite system rather than a single flat sprite.

```ts
interface AvatarStyle {
  schema: 'docklands.avatar.v1';
  body: {
    silhouette: 'compact' | 'tall' | 'round' | 'angular';
    skinTone: string;
    stance: 'steady' | 'bouncy' | 'relaxed' | 'brisk';
  };
  face: {
    eyes: string;
    brows: string;
    mouth: string;
    freckles?: boolean;
    glasses?: string;
  };
  hair: {
    shape: string;
    color: string;
    accessory?: string;
  };
  outfit: {
    top: string;
    bottom: string;
    shoes: string;
    outerwear?: string;
    palette: string[];
  };
  gear: {
    hat?: string;
    tool?: string;
    back?: string;
    badge?: string;
  };
  emotes: string[];
}
```

Rendering:

- base body layer
- skin/face layer
- hair layer
- outfit layer
- gear/accessory layer
- shadow layer
- emote/gesture overlay

The renderer should support four facing directions for v1: south, east, west, north-ish. We do not need full 8-direction animation in the first slice.

#### 8.0.2 Creator controls

| Control | First slice | Later |
|---|---|---|
| Body | silhouette, stance | height micro-variants, walk style |
| Skin | curated tone swatches | custom tone picker with contrast guard |
| Face | eyes, brows, mouth, glasses | expression packs |
| Hair | shape, color, accessory | dye gradients, animated accessories |
| Outfit | top, bottom, shoes, palette | layered coats, uniforms |
| Gear | hat, tool, badge | animated gear, event props |
| Emotes | wave, cheer, repair, point, dance | room-specific emote packs |
| Nameplate | display name, color, room title | title badges, guestbook frame |

Creator UX:

- preview avatar standing inside the actual dock, not on a blank profile screen
- swatches for visual choices
- segmented controls for body/face/hair/outfit/gear/emotes
- no text-heavy setup
- randomize button
- save as captain
- apply a look to crew member
- export avatar card as part of room postcard only with user action

#### 8.0.3 Progression and unlocks

Customization unlocks should come from play, not spending:

| Unlock source | Example reward |
|---|---|
| Clear wave | tide boots, brass badge |
| Host live room | host sash, dock-night emote |
| Receive guestbook stamp | visitor pin |
| Gift blueprint | maker gloves |
| Cross-app `game.completed` | arcade trophy badge |
| Crew morale streak | cozy outfit palette |
| Build challenge | architect hat |

No loot boxes. No paid rarity. No tradeable paid cosmetics.

#### 8.0.4 Private identity

The captain is a local profile, not a Shippie account.

| Identity layer | Stored where | Shared when |
|---|---|---|
| captain display name | local IDB | live room, postcard, guestbook if user allows |
| avatar style | local IDB/OPFS atlas cache | visible to live guests, optional in capsules |
| device public key | local secure seed/WebCrypto | signed receipts, guestbook stamps |
| passkey captain identity | optional future | high-trust room recovery |
| block/mute list | local IDB | never exported by default |

Guest mode should support "arrive as local display name" and "arrive as temporary guest". The default for unknown live rooms should be a temporary guest identity.

#### 8.0.5 Crew customization

Crew should be customizable, but with more constraints than captain:

- rename crew
- recolor outfit
- choose role uniform
- assign badge/tool
- set idle station
- choose two favorite emotes

Crew silhouettes stay recognizable by role so the player can read the room at a glance.

#### 8.0.6 Accessibility and inclusivity

- no gender lock on body, hair, outfit, role, or voice flavor
- high-contrast outline option
- colorblind-safe role markers beyond color alone
- reduced motion toggle affects avatar idle and water/tide effects
- text labels for emotes in control sheets
- minimum tap target 44px on mobile
- no body-shaming trait labels

### 8.1 Room grid

First slice:

- 10x10 isometric grid on mobile
- 12x12 optional upgrade on desktop
- **the Beacon occupies the center tile(s)** — the objective the Tide paths *toward* (see §6.0.2)
- one Tide Gate at a room edge in the first slice; later waves/larger rooms open additional edge gates so multiple approaches converge inward
- furniture can occupy 1x1, 1x2, 2x1, or 2x2 tiles
- pathing updates immediately when objects move
- no hard-lock layouts: the game rejects placements that block *every* gate-to-Beacon path unless in edit-only mode

Room layers:

| Layer | Examples |
|---|---|
| Floor | dock planks, water, rug, rail tile |
| Blockers | crates, counters, walls, benches |
| Utility | bed, galley, desk, radio, bath, generator |
| Defense | bell turret, net launcher, spark coil, decoy buoy |
| Social | sofa, dance tile, guestbook, stage, board |
| Trophy | plaques, pennants, signed bottles, replay screens |
| Logic | pressure plate, switch, lock, route sign |

### 8.1.1 The Beacon

The Beacon is the single most important object in the game: the thing you protect, your save file made physical, your room's signature, and your progress trophy. It is **not** a static HP bar — it is a **living lighthouse-lantern** with four composing systems.

#### 8.1.1a It grows (the progress trophy)

The Beacon physically grows as you clear Tides and hit milestones. Its silhouette *is* your progress — visible at a glance to you and to any visitor.

| Stage | Unlocked by | Look |
|---|---|---|
| 1 · Hand-lantern | new room | a small lantern on a post, soft glow |
| 2 · Standing lamp | first Tide cleared | taller, steady beam, a little brass |
| 3 · Signal post | ~5 Tides / room rep | rotating light, wider beam, banners |
| 4 · Lighthouse | deep progress / King Tide cleared | full spire, sweeping beam, weather vane |
| 5 · Landmark | seasonal / mastery | ornate, animated, room-defining centerpiece |

Growth is **cosmetic-but-earned** — it never gates core difficulty, so a new player's small Beacon is just as defensible. "Look how big my Beacon got" is a share moment in itself.

#### 8.1.1b It holds Lenses (the loadout)

The Beacon has **lens sockets** (1 at stage 1, up to 4 by stage 5). Slot earned **Lenses** for room-wide buffs — a collect/craft loop that turns the Beacon into a loadout, not just a target.

| Lens | Effect | Source |
|---|---|---|
| Tide Lens | first gunk burst enters 30% slower | starter blueprint |
| Warmth Core | crew morale regenerates during the day | craft |
| Spark Core | all zappers +15% clear rate | salvage shop |
| Fog Cutter | path preview can't be hidden by Fog Wisps | Tide reward |
| Echo Lens | the Beacon Pulse costs 20% less power | rare blueprint |
| Trophy Prism | cross-app trophies each grant a tiny passive | cross-app proof |

Lenses are earned, copyable as gifts, and never real-money (consistent with §11 and the Habbo anti-pattern in Appendix A).

#### 8.1.1c It runs on power (the second resource)

The Beacon has a **power meter** (kid word: *power*). By day it lights the room and runs utilities; during a Tide it is your **ability budget**:

- Crew ultimates, the Spark Coil, and the Beacon Pulse all draw from power.
- The **Charger** crew role (and the spark gauntlet) refill it; some furniture (generator, solar sail) trickle-charges it.
- Risk/reward: spend power to fight harder, but a drained Beacon dims and its hearts (integrity) take a little longer to recover between Tides. Power is **never** required to survive a basic Tide — it's the "push harder" layer.

Hearts (§8.3) remain the simple, always-visible integrity gauge for the 10-year-old test. Power is the deeper resource that sits behind abilities — surfaced only after the first win.

#### 8.1.1d It's a signal (the social hook)

Thematically, a brighter Beacon is *seen farther* — so Beacon stage gates **co-op capacity**:

| Beacon stage | Co-op crew slots (guest devices) |
|---|---|
| 1–2 | 1 guest |
| 3 | 2 guests |
| 4 | 3 guests |
| 5 | 4 guests + spectator dock |

This ties progression directly to the social loop: growing your Beacon literally lets you host more friends as crew (§8.2.1). Lighting the Beacon = "open my dock."

#### 8.1.1e The Beacon Pulse (the panic button)

The host (or solo captain) can spend power to fire a **Beacon Pulse**: a shockwave from the center that shoves *all* gunk back toward the gates and briefly stuns it. It is the satisfying, readable "save" — a big telegraphed wind-up, a bright ring, an audible thrum. Cooldown + power cost keep it from trivializing waves. Lens and captain upgrades tune its radius, knockback, and cost.

### 8.2 Crew

Crew is the Sims-like attachment layer **and the heart of the game** — see §8.2.1 for the command-vs-embody model and crew gear.

Each crew member has:

```ts
interface CrewMember {
  id: string;
  name: string;
  role: 'builder' | 'host' | 'tactician' | 'charger' | 'scout' | 'maker';
  level: number;          // bond level — rises by surviving Tides
  xp: number;
  traits: string[];
  tool: CrewTool;         // the friendly gear this role carries (§8.2.1)
  toolTier: 1 | 2 | 3;    // upgrade tier
  ultimateReady: boolean; // charged by bond level + Tide performance
  controlledBy: 'ai' | string; // 'ai' (solo/command) or a guest deviceId (co-op embody, §8.2.1)
  needs: {
    comfort: number;
    morale: number;       // also a live combat buff during Tides (§8.4.2)
    spark: number;
    grit: number;
    safety: number;
  };
  relationships: Record<string, number>;
  assignedStation?: string;
}

interface CrewTool {
  kind: 'hammer' | 'horn' | 'flare' | 'gauntlet';
  // friendly tool, never "weapon" in player copy
}
```

Needs affect gameplay but should not become a chore:

- low comfort slows crafting
- low morale lowers guest rewards
- low spark lowers blueprint discovery
- low grit lowers repair speed
- low safety increases wave panic

There is no death in v1. Failure creates repairs, fatigue, broken items, and funny room drama.

### 8.2.1 Crew gear: command (solo) and embody (co-op)

Crew are mobile defenders, not decoration. Each role carries a **friendly tool** that does a day job *and* doubles as a Tide defense. The same crew member is **AI-commanded** when you play solo and **player-embodied** when a friend joins (§8.2.2) — `controlledBy` flips between `'ai'` and a guest device id.

| Crew | Role | Tool (gear) | Day use | Tide use |
|---|---|---|---|---|
| Mira | Builder | **Rivet hammer** | repairs blockers/furniture faster | knockback bash, shoves gunk off a tile |
| Penn | Host | **Signal horn** | buffs visitors, runs parties | cone stun/slow (a sound wave) |
| Jax | Tactician | **Flare & scope** | scouts salvage, reads replays | **marks** gunk → all zappers focus-fire the mark |
| Sol | Charger | **Spark gauntlet** | hand-charges the Beacon's power | zaps adjacent gunk, refills Beacon power |

**Solo (command):** you direct crew — drag them to stations, set a focus, fire their ability — and they auto-act with their tool on a cooldown. Think "coach + a couple of helpers."

**Co-op (embody):** each guest device *is* one crew member, actively aiming and timing that tool. A horn cone you place by hand is more fun and more skillful than an AI cooldown — co-op is the same room, played with hands instead of commands.

**Crew upgrade tracks** (the RPG layer, replacing the thin "crew role" row in §8.4):

| Track | What it raises | Earned by |
|---|---|---|
| Tool tier (1→3) | gear power/utility (hammer → pneumatic → seismic; horn radius; flare marks; gauntlet charge) | salvage + blueprints |
| Role mastery | passive perks (Mira repairs 2 tiles; Penn radius +50%; Jax marks 2 targets; Sol overcharge) | role XP |
| Bond level | crew XP from surviving Tides; unlocks the **ultimate** | play time + wins |
| Identity | outfit, badge, idle station, two emotes (§8.0.5) | cosmetic unlocks |

**Ultimates** (bond-gated, power-costed, once per Tide): Penn's **Block Party** (briefly freezes all gunk + heals crew morale); Mira's **Instant Bulwark** (drops a full wall segment); Jax's **Spotter Barrage** (calls a flare strike on all marked gunk); Sol's **Overload** (dumps stored power into a Beacon Pulse for free).

### 8.2.2 Co-op: one device, one crew member

The headline social feature: **"come be my crew."** It reframes co-op from "visit my room" to "play my room with me."

- **Join:** a guest scans the QR/join code (§10.7) and picks an **available crew body** (or is auto-assigned). The host's device stays authoritative.
- **Asymmetric roles:** the **host** builds, owns the Beacon, fires the Pulse, and sets the layout (the "coach"). **Guests** are mobile — they run the room, aim a tool, repair, charge, and trigger their crew ultimate (the "players"). Different powers, one shared goal.
- **Transport:** host-authoritative over `@shippie/proximity` (Yjs), **commands not raw mutations** (already required by §8.3 sim rules and §10.5). Each guest sends intents ("swing here", "mark that gunk"); the host's deterministic engine resolves them, so replay receipts still validate.
- **Drop-in / drop-out:** a guest leaving → their crew member reverts to `controlledBy: 'ai'` mid-Tide with no desync. Robust to flaky phone connections.
- **Shared spoils + viral seeding:** salvage from a co-op Tide is shared, and each guest leaves with a **copy of one blueprint** they helped earn — so they go home wanting to build their *own* dock. The strongest organic growth loop in the design.
- **Local-first guarantee:** solo play is fully offline; co-op is opt-in, presence-only, and every live session is logged to the Trust Ledger (§8.8 / §11). Nothing about embodiment requires a Shippie account or central server.

### 8.3 Tower-defense wave

**Objective:** Drift enters from the edge Gate(s) and paths inward toward the center Beacon. Each Drift that reaches the Beacon costs **one heart** (player-facing) / one Beacon-integrity point. Clear all Drift in a Tide before hearts hit zero to win the wave; zero hearts ends the Tide (kindly — see §8.10). Hearts refresh per Tide so each wave is a clean, retryable challenge.

The gunk is **washed-in junk that's drifted to life**, never people or animals to harm — googly-eyed clutter you *clear*. The names are literally junk:

| Gunk (Drift) | Behavior | Reads as |
|---|---|---|
| Bottle Skippers | fast, low HP | bobbing bottles |
| Rust Crabs | slow, armored | crusty rust-lumps |
| Fog Wisps | briefly hide the path preview | damp grey puffs |
| Kelp Crawlers | split into two smaller blobs when cleared | tangled seaweed |
| Tide Brute | mini-boss; shoves adjacent blockers; needs crew coordination (Jax marks, Mira knocks back, zappers focus) | a big tangled junk-mass |

Defense objects — **silhouette tells you the job** (not just colour, see §8.3.1):

| Item | Role | Silhouette |
|---|---|---|
| Bell Turret (zapper) | single-target clear | bell on a post |
| Net Launcher | slows + groups gunk | winch + net drum, draws a net cone |
| Spark Coil | chain clear, draws Beacon power | Tesla coil with visible arcs |
| Decoy Buoy | redirects gunk briefly | bobbing buoy with a flag |
| Repair Drone | fixes blockers during a Tide | little hovering fan |
| Tide Gate | delays the first gunk burst | a portcullis at the edge |

Simulation requirements:

- deterministic from `{room_hash, wave_seed, item_state, crew_state}`
- fixed-timestep engine
- replay receipts validate with hash chain
- no hidden server authority in MVP
- live co-op sends commands, not raw world mutations (guest crew intents resolve on the host engine, §8.2.2)

### 8.3.1 Turret legibility (read it without a menu)

Defenses must be readable at a glance — the #1 thing the current mockup is missing:

- **Range rings.** Selecting or placing a turret draws its range as a translucent ring on the floor; the placement ghost shows it *before* you commit. A child sees exactly what a turret covers.
- **Silhouette = function** (table above). Distinct shapes, not recolours, so the room reads instantly.
- **Upgrade shows on the model.** L2 grows a second barrel; L3 gains a glowing core + a larger base footprint (warned on the floor). A turret's level is legible without opening anything.
- **Firing tracer + barrel tracking.** A brief tracer to the current target and a barrel that visibly turns to track it — you can see each turret working.
- **Tap-to-explain (Look mode).** Tapping a turret shows one plain line: *"Zapper — clears one piece of gunk at a time. Range: 3 tiles."*
- **"Show coverage" toggle (optional).** In Build mode, faintly shade the floor by how many turrets cover each tile, so undefended gaps are obvious. Off by default; for players who want it.

### 8.3.2 Tide telegraph and themes

- **Manifest preview.** Before you press Start, the Tide shows what's coming — e.g. `3 × Bottle Skipper · 1 × Tide Brute` as icons — so the player can plan builds. No surprise spikes; planning is the fun.
- **3·2·1·GO countdown** (already in the mockup) so the wave never starts by ambush.
- **Tide themes / seeds.** Each session's Tide has a flavour seed — **Rust Tide** (armoured-heavy), **Fog Tide** (vision-hiding), **Kelp Tide** (splitters) — giving variety and a shareable challenge identity ("beat my Rust Tide"). Themes are deterministic from the seed, so a shared capsule replays the exact same Tide.

### 8.4 RPG upgrades

Upgrade tracks:

| Track | Examples |
|---|---|
| Captain | more Beacon abilities, faster command cooldowns, stronger Pulse |
| Crew | tool tier, role mastery, bond/ultimate, identity — **full detail in §8.2.1** |
| Beacon | growth stage, lens sockets, power capacity, signal range (co-op slots) — **§8.1.1** |
| Furniture | bed comfort, workbench crafting speed, generator capacity |
| Defense | turret tier (visible on model), net duration, coil jumps |
| Room | grid expansion, extra gate, guest capacity |
| Social | guestbook rewards, party buffs, blueprint gifts |

Hard rule: upgrades must preserve creativity. A beautifully arranged room should be viable, not punished for not being a mathematically perfect maze.

### 8.4.1 Crew roles

| Role | Gear (§8.2.1) | Room-life value | Tide value | Social value |
|---|---|---|---|---|
| Builder (Mira) | Rivet hammer | repairs furniture, improves comfort | knockback bash; faster blocker repair | can approve guest build requests |
| Host (Penn) | Signal horn | improves morale, runs parties | cone stun/slow; boosts co-op cooldowns | better guestbook stamps and parties |
| Tactician (Jax) | Flare & scope | improves training and safety | marks gunk for focus-fire; path hints | explains replay failures |
| Charger (Sol) | Spark gauntlet | hand-charges Beacon power | zaps adjacent gunk; refills Beacon power | powers group abilities/Pulse |
| Scout | (future) | finds salvage/blueprints offline | reveals Tide modifiers | brings visitor rumours/events |
| Maker | (future) | crafts decor and utility items | upgrades turrets/traps | packages blueprint gifts |

First slice ships **Builder, Host, Tactician, and Charger** as the four fixed starter crew (Charger added because Beacon power, §8.1.1c, needs an active refiller and a fourth co-op body). Scout and Maker stay visible as locked future slots if the UI can do that without feeling like a store.

### 8.4.2 Crew needs

| Need | Raised by | Lowered by | Gameplay effect |
|---|---|---|---|
| Comfort | beds, seating, rugs, lamps | broken room, overcrowding | crafting and idle recovery speed |
| Morale | parties, trophies, guest visits | failed waves, stale rooms | guest rewards, co-op cooldowns, **and a live Tide buff: happy crew clear gunk faster and recover ultimate charge quicker** |
| Spark | workbench, art, puzzles, sibling-app trophies | repetitive waves | blueprint discovery |
| Grit | training station, repairs, hard waves | fatigue | repair speed and panic resistance |
| Safety | path clarity, walls, generator health | enemy breaches, messy routes | wave start confidence and crew focus |

Needs tick only while the app is active or resumed to foreground. Offline catch-up should be capped and forgiving: the player returns to a few story prompts, not a ruined room.

### 8.4.3 Launch blueprint catalog

First-slice blueprints should be enough to make rooms expressive and strategic:

| Blueprint | Type | Use |
|---|---|---|
| Captain Bed | utility | raises comfort, crew recovery |
| Galley Stove | utility | morale bump after waves |
| Brass Lantern | decor/social | first reward, postcard anchor |
| Workbench | utility | blueprint crafting |
| Radio Mast | social | live-room open affordance |
| Guestbook Stand | social | signed visits and receipts |
| Crate Wall | blocker | routes enemies |
| Bridge Tile | floor/path | shapes tide route |
| Bell Turret | defense | starter damage |
| Net Launcher | defense | slow/control |
| Spark Coil | defense | chain damage |
| Decoy Buoy | defense | redirect burst |
| Repair Drone Dock | defense/utility | repairs blockers |
| Tide Gate | defense | controls spawn burst |
| Trophy Shelf | trophy | cross-app achievements |
| Bulwark Pennant | trophy | consumes `wave.cleared` |
| Puzzle Poster | trophy | consumes `puzzle.cleared` |
| Party Sofa | social | guest comfort |
| Pressure Plate | logic | triggers simple room action |
| Lock Door | logic | host-controlled access |

### 8.4.4 Room reputation

Room reputation is not a global leaderboard. It is a local, shareable title shown in-room.

Inputs:

- highest cleared tide wave
- unique guestbook stamps
- blueprint variety
- crew happiness streaks
- replay receipts from other devices
- cross-app trophies placed in-room

Example titles:

- Beacon Dock
- Safe Harbor
- Tidebreaker Room
- Open Dock
- Brass Quarter
- Storm Host

Room title appears on postcards and invite sheets. It should never imply globally verified ranking unless a future signed-neighborhood system exists.

### 8.5 Crafting and economy

No real-money currency.

Local resources:

- **Salvage**: earned from waves and async challenges
- **Spark**: earned from crew happiness and social visits
- **Blueprint fragments**: earned from events, trophies, and guest gifts
- **Reputation**: visible room progression

Trading model:

- v1: blueprint gifting only, no item-for-item trades
- gifts are copyable recipes, not transferred ownership
- guest gifts are signed and rate-limited
- no scarcity market
- no random paid boxes

This keeps the social "I gave you something" feeling without recreating Habbo's scam/trading economy.

### 8.6 Room permissions

Host-controlled permissions:

| Permission | Default |
|---|---|
| View room | Anyone with invite |
| Chat | Guests with invite |
| Emote | Guests with invite |
| Move host furniture | Off |
| Place guest gift | Ask host |
| Start wave | Host only |
| Trigger co-op role ability | Guests during live wave |
| Sign guestbook | Guests after 2 minutes or wave clear |
| Export snapshot | Host only in v1 |

### 8.7 Guestbook

Guestbook is both social memory and viral proof:

```ts
interface GuestbookEntry {
  id: string;
  roomId: string;
  authorDisplay: string;
  authorDevicePub?: string;
  kind: 'visit' | 'wave_clear' | 'blueprint_gift' | 'replay';
  summary: string;
  signedAt: string;
  signature?: string;
  replayHash?: string;
}
```

Guestbook entries can appear as:

- wall stickers
- dock stamps
- bottle messages
- replay plaques
- party photos

### 8.8 Events

Weekly local-first events:

- **Friday Tide**: fixed seed wave globally, but played locally
- **Open Dock Night**: friends visit live rooms
- **Blueprint Jam**: build with a limited set of objects
- **Guestbook Sprint**: get three signed visits
- **Quiet Week**: no wave pressure, Sims-like life focus

Events should not require a central leaderboard in v1. Use signed receipts and optional local friend leaderboards.

### 8.9 Quest and challenge types

| Challenge | Solo/offline | Live | Async |
|---|---|---|---|
| Clear the tide | yes | yes | yes |
| Build under budget | yes | spectator/share only | yes |
| Keep crew morale high | yes | visitors can help | no |
| Host a dock night | no | yes | no |
| Gift a blueprint | no | yes | yes |
| Beat my tide | yes | optional | yes |
| Trophy placement | yes | visitors inspect | yes |
| Repair after failure | yes | guests can assist | no |

The game should never require live multiplayer for core progression. Live play makes rewards richer and stories better, but the owner can continue alone.

### 8.10 Failure states

Failure should be memorable but gentle:

| Failure | Result |
|---|---|
| Enemy reaches core | wave ends, generator damaged, crew safety drops |
| Furniture breaks | object enters repair state, still visible |
| Crew morale tanks | host rewards lower until room improves |
| Guest disconnects | role becomes vacant, host can continue |
| Live sync drops | wave can finish locally, receipt marked `solo-after-drop` |
| Share import invalid | capsule rejected with clear reason, no state mutation |

There is no permadeath, no stolen inventory, and no paid recovery path.

---

## 9. Visual and interaction direction

### 9.1 Visual thesis

Miniature floating diorama meets browser-native light show: polished brass, salt-blue water, painted wood, chunky readable silhouettes, glowing Beacon glass, animated tide paths, and furniture that visibly transforms between cozy room object and defensive device.

The art should feel warmer than a strategy game, more physical than a dashboard, and more alive than a static isometric room. The player should want to screenshot it because the room looks like a little magical machine they built.

### 9.1.1 Visual ambition checklist

| Visual move | Why it matters | First implementation |
|---|---|---|
| Beacon as anchor | The goal is instantly readable. | Large glowing room object with health ring and light spill. |
| Day/Tide transformation | The premise becomes obvious. | CSS/canvas state shift: warm room lights in Day, bioluminescent route and rising water in Tide. |
| Furniture unfolding | Makes "furniture fights" believable. | Turret bell pops open, crate wall braces, workbench sparks, lantern becomes buff radius. |
| Living diorama camera | Browser game feels premium. | Subtle parallax water, idle crew, projector-like shadows, no boxed preview frame. |
| Shareable postcard composition | Viral object needs beauty. | Actual room render with title, wave seed, Beacon state, and guest stamps. |
| Full character silhouette | Avatar identity sells social presence. | Modular captain layers with clear hair/outfit/gear/emote changes. |
| Reduced-motion parity | Stunning should not mean inaccessible. | Same game state with static glow, no bobbing route/water motion. |

### 9.2 Content plan

| Surface | Job | First-slice content |
|---|---|---|
| Main room | The game starts here | Isometric dock, crew, objects, tide gate, core |
| Bottom tool rail | Fast building and wave controls | Day, Build, Tide, Open, Share |
| Inspector | Details without leaving room | selected item, upgrade, move, rotate, permission |
| Share sheet | Make play portable | QR, link, postcard, challenge capsule |
| Guest mode | Join without confusion | avatar, room rules, co-op role, leave stamp |

### 9.3 Interaction thesis

1. Room loads like a tiny stage: lamps flick on, water shimmers, crew idle into place.
2. Build mode snaps furniture with a soft shadow and path preview, so the room feels physical.
3. Tide mode turns the path into a glowing route, then enemies wash in from the gate; co-op role actions pulse above avatars.

### 9.4 UI posture

This should not look like a dashboard. It should feel like a living toy.

Rules:

- first screen is the playable room, not a landing page
- no decorative cards around the game canvas
- controls are compact icon buttons with labels only where needed
- inspector is a sheet, not a full page
- avatars and objects stay readable on mobile
- no dark-blue/purple gradient app shell
- no generic SaaS panels
- screenshots/postcards must show the actual room

---

## 10. Shippie architecture

### 10.1 App location

Proposed new app:

```
apps/showcase-docklands/
```

Proposed packages only if needed after MVP pressure:

```
packages/docklands-sim/       # deterministic room/wave engine
packages/docklands-assets/    # generated/local sprites if shared later
```

Recommendation: start with app-local engine modules, extract `packages/docklands-sim` only once tests and replay validation make the boundary worthwhile.

### 10.2 Manifest sketch

```json
{
  "$schema": "https://shippie.app/schemas/app.json",
  "name": "Docklands",
  "slug": "docklands",
  "description": "Build a tiny harbor room, raise a crew, invite friends, and defend the tide together.",
  "icon": "/icon.svg",
  "theme_color": "#1E615E",
  "background_color": "#F7F0DF",
  "visibility": "public",
  "display": "standalone",
  "orientation": "portrait",
  "groups": {
    "enabled": true
  },
  "intents": {
    "provides": [
      "game.completed",
      "wave.cleared",
      "docklands.room_opened",
      "docklands.blueprint_gifted",
      "docklands.guestbook_signed"
    ],
    "consumes": [
      "game.completed",
      "wave.cleared",
      "puzzle.cleared"
    ]
  },
  "curation": {
    "surface": "arcade",
    "category": "games",
    "tier": "flagship",
    "subcategory": "social-strategy"
  },
  "data_passport": {
    "family": "docklands",
    "schema": "docklands.v1"
  },
  "remix_allowed": true
}
```

Note: new observation kinds need to be added to `packages/observations/src/index.ts` and declared in the manifest before bridge grants work.

### 10.3 Local state

State stores:

| Store | Purpose |
|---|---|
| `profile` | captain, local settings, device display name |
| `rooms` | owned room documents |
| `inventory` | blueprints, resources, cosmetics |
| `crew` | crew members and needs |
| `guestbook` | signed visit/replay entries |
| `replays` | compact command logs and receipts |
| `shares` | exported capsule metadata |

Recommended storage:

- IDB for structured state
- OPFS for generated postcards/replay blobs if large
- local deterministic migration tests for schema changes

### 10.4 Room document

```ts
interface DocklandsRoomDocument {
  schema: 'docklands.room.v1';
  roomId: string;
  ownerDevicePub?: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  grid: {
    width: number;
    height: number;
    floor: FloorTile[];
  };
  placed: PlacedItem[];
  crew: CrewMember[];
  permissions: RoomPermissions;
  progression: RoomProgression;
  guestbookHead?: string;
}

interface PlacedItem {
  id: string;
  blueprintId: string;
  x: number;
  y: number;
  rot: 0 | 1 | 2 | 3;
  level: number;
  state?: Record<string, unknown>;
}
```

### 10.5 Live room transport

Use existing `@shippie/proximity`:

- `createGroup({ appSlug: 'docklands' })`
- `joinGroup({ appSlug: 'docklands', joinCode })`
- Yjs shared state for presence, chat, co-op commands, and short-lived wave session
- host keeps authoritative local room document in MVP
- guests receive a room snapshot and submit command intents

Live shared maps:

| Yjs key | Data |
|---|---|
| `presence` | peer id, display name, avatar, cursor/tile |
| `chat` | short event log, host-moderated |
| `wave` | seed, phase, command log, current tick |
| `roles` | guest role assignments |
| `guest_actions` | emotes, repairs, marks, charge pulses |

### 10.6 Sync modes

| Mode | MVP behavior | Future behavior |
|---|---|---|
| Offline | full solo room, crew, waves | richer NPC visitors |
| Same-device/local | BroadcastChannel/Yjs for tabs | local LAN peer discovery |
| Live internet | SignalRoom group while room open | WebRTC preferred, Signal fallback |
| Async | signed room capsule and replay receipt | sealed-cloud private-space sync |
| Cross-device owner sync | manual export/import in first slice | sealed checkpoint/private space |

### 10.7 Share capsule

```ts
interface DocklandsShareCapsule {
  schema: 'docklands.share.v1';
  kind: 'room-postcard' | 'beat-my-tide' | 'blueprint-gift' | 'replay-receipt';
  createdAt: string;
  app: 'docklands';
  roomHash: string;
  payload: unknown;
  signature?: string;
}
```

Share types:

| Type | Payload |
|---|---|
| `room-postcard` | image + room name + room hash |
| `beat-my-tide` | room snapshot + wave seed + constraints |
| `blueprint-gift` | blueprint id + sender note + signature |
| `replay-receipt` | command hash + result + room hash |

### 10.8 Trust Ledger rows

Docklands should make ledger visibility feel native:

- opening a live room logs network/sync egress
- exporting a capsule logs share egress
- receiving a blueprint logs import
- consuming `game.completed` logs intent consumption
- emitting `wave.cleared` logs intent provision

In the room UI, a tiny "Trust" item in the guestbook can say:

> This dock shared a live-room signal and 3 wave receipts. View details.

No payload logging. Redacted summaries only.

### 10.9 End-to-end lifecycle

#### New room

1. App boots inside Shippie container.
2. Docklands opens local IDB stores.
3. If no profile exists, Captain setup writes `profile` and creates starter room.
4. Starter room is created from a deterministic template:
   - room id
   - floor grid
   - starter blueprints
   - starter crew
   - first-wave seed
5. First save commit writes `rooms`, `crew`, `inventory`, and `guestbook`.
6. The room screen renders directly from local state.

#### Build action

1. Player opens Build tray.
2. Player selects blueprint.
3. Preview validates footprint and path.
4. Confirm emits a `DocklandsCommand`.
5. Engine applies command to local room state.
6. Persistence writes updated room document.
7. Renderer updates item, path overlay, crew need effects, and undo affordance.

#### Wave action

1. Player opens Tide panel.
2. Engine derives wave from `roomHash + waveSeed + progression`.
3. Player starts wave.
4. Simulation runs fixed timestep.
5. Player and co-op commands append to command log.
6. End state produces:
   - result summary
   - command-log hash
   - room hash
   - reward bundle
7. App commits rewards and emits `wave.cleared`; final campaign wave emits `game.completed`.

#### Live room action

1. Host taps Open dock.
2. App calls `createGroup({ appSlug: 'docklands' })`.
3. Host gets join code/QR.
4. Trust Ledger records live-room egress through bridge/runtime.
5. Guest calls `joinGroup({ appSlug: 'docklands', joinCode })`.
6. Host shares room snapshot into Yjs `room_snapshot`.
7. Guests write presence/emote/role commands only.
8. Host validates commands and applies them to live wave state.
9. On completion, every client receives result hash; host commits authoritative receipt.

#### Async share action

1. Player selects Share -> Beat my tide.
2. App snapshots room with redacted owner display fields.
3. App signs capsule locally where signing material exists; otherwise hash-only MVP receipt.
4. Shippie share package creates link/file/QR.
5. Trust Ledger records share egress.
6. Recipient imports capsule into clean local state.
7. Recipient runs wave, produces replay receipt, and can send it back as a signed capsule.

### 10.10 Authority, conflict, and sync model

| Situation | Authority | Conflict rule |
|---|---|---|
| Owner editing offline | owner device | local command order |
| Two owner tabs | latest valid command per local clock, same IDB transaction boundary |
| Live guest emote/chat | guest peer | event log append, host can clear |
| Live guest co-op action | host validates | invalid command ignored and logged locally |
| Live furniture placement | host only in MVP | guest requests become pending prompts |
| Async challenge | imported snapshot | no mutation to owner's room until receipt accepted |
| Cross-device owner import | importing device | user chooses replace/duplicate; no silent merge in MVP |
| Sealed sync follow-up | room document CRDT + command log | item IDs stable; conflicting moves last-writer with visible history |

Why host-authoritative MVP:

- deterministic replay is easier
- guest griefing is contained
- Shippie can demonstrate live play without inventing a full MMO server
- async import/export remains clean

### 10.11 Package boundaries

Suggested app-local module layout:

```
apps/showcase-docklands/src/
|-- app.tsx
|-- engine/
|   |-- commands.ts
|   |-- hash.ts
|   |-- pathing.ts
|   |-- sim.ts
|   |-- wave.ts
|   `-- rewards.ts
|-- state/
|   |-- db.ts
|   |-- migrations.ts
|   |-- room-store.ts
|   `-- share-capsule.ts
|-- live/
|   |-- host-room.ts
|   |-- join-room.ts
|   |-- live-doc.ts
|   `-- peer-events.ts
|-- observations/
|   |-- emit.ts
|   `-- trophies.ts
|-- ui/
|   |-- DockCanvas.tsx
|   |-- BottomRail.tsx
|   |-- BuildTray.tsx
|   |-- CrewSheet.tsx
|   |-- TidePanel.tsx
|   |-- LiveRoomSheet.tsx
|   |-- Guestbook.tsx
|   `-- ShareSheet.tsx
`-- assets/
    |-- sprites/
    `-- audio/
```

Extraction rule: move `engine/` into `packages/docklands-sim` only after wave determinism, pathing, and replay tests are stable enough that another app could import it.

### 10.12 Browser capability review - 2026

Modern browsers can support a more ambitious game than the current mockup suggests. Docklands should be designed as a browser-native private world engine, not as a thin web page.

| Capability | What is possible now | Docklands use | Constraints and fallback |
|---|---|---|---|
| WebGPU | High-performance GPU rendering and compute in supporting browsers; MDN describes it as the WebGL successor with modern GPU features and general-purpose compute. | Rich isometric lighting, particle tide, animated water, avatar skin compositing, GPU path/visibility previews, optional local simulation acceleration. | Not Baseline across all major browsers. Ship Canvas/WebGL2 fallback; never make WebGPU required for save/progression. Source: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API |
| WebGL2/Canvas2D | Widely usable canvas rendering path for 2D and stylized 2.5D games. | Default first production renderer if WebGPU risk is too high; sprite atlas, room layers, path overlay, hit-testing. | Less modern than WebGPU; more CPU overhead; still enough for v1. |
| WebAssembly | Near-native code path for simulation, pathfinding, compression, replay verification, and future Rust engine modules. | Deterministic engine, replay hash verification, capsule compression, optional physics/AI routines. | JS TypeScript is fine for first slice; move to Wasm only when profiling proves need. Source: https://developer.mozilla.org/en-US/docs/WebAssembly |
| Web Workers | Background threads for expensive tasks away from the UI. | Run simulation, pathfinding, thumbnail generation, capsule compression, and import validation off the main thread. | Worker boundaries require serializable messages or SharedArrayBuffer. Source: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API |
| OffscreenCanvas | Render to canvas from a worker where supported. | Keep room animation smooth while UI sheets and Shippie shell operate. | Support varies; keep main-thread render fallback. |
| SharedArrayBuffer | Shared memory between workers when cross-origin isolation headers are set. | Future high-performance engine loop, lockstep command buffer, Wasm threads. | Requires cross-origin isolation, which can complicate embeds and third-party assets; only enable in Shippie-controlled runtime. Source: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer |
| IndexedDB | Persistent browser database for significant structured data and blobs. | Profile, rooms, crew, inventory, guestbook, replays, migrations. | Not server sync by itself; schema/versioning must be disciplined. Source: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API |
| OPFS | Origin-private file storage optimized for app-owned files; private to the origin and quota-bound. | Large sprite atlases, generated postcards, replay blobs, local asset packs, world cache. | Subject to quota/eviction; recent FROST research shows storage timing can create fingerprinting side-channel risk, so Docklands must avoid suspicious high-volume timing loops and expose storage use. Sources: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system and https://hannesweissteiner.com/publications/frost/ |
| Storage persistence | Browsers can allow persistent storage requests and quota estimates through StorageManager. | First-run "keep my dock on this device" prompt after the player has value, not before. | Browser behavior differs; always support export/import capsules. Source: https://developer.mozilla.org/en-US/docs/Web/API/StorageManager |
| Service workers and Cache API | Offline shell and asset caching for PWAs. MDN frames service workers as enabling apps to function even with intermittent connectivity. | Installable offline Docklands shell, cached sprites/audio, offline import/export, versioned asset snapshots. | Browser background execution is limited; do not promise background simulation. Source: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation |
| BroadcastChannel | Same-origin tab/window/worker messaging. | Same-device multi-tab play, local owner tab coordination, dev/test harness. | Same origin only. Source: https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API |
| Web Locks | Cross-tab async locks. | Prevent two tabs from corrupting the same room migration/export; serialize checkpoint writes. | Lock discipline required; never block core UI indefinitely. Source: https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API |
| WebRTC data channels | Peer-to-peer arbitrary data between browsers; MDN notes the data need not pass through the application server. | Local/live room commands, presence, emotes, capsule transfer, LAN-style private sessions. | Needs signaling/rendezvous; ICE metadata can leak network info; use Shippie controls and clear trust rows. Source: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels |
| WebSocket | Reliable bidirectional server connection. | Shippie SignalRoom fallback and relay for room rendezvous. | Server/edge sees connection metadata; payloads should be encrypted where private. Source: https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API |
| WebTransport | HTTP/3 streams and datagrams for low-latency client-server communication. | Future edge authoritative events, spectators, high-frequency co-op with unreliable datagrams. | Limited support and server complexity; not MVP. Source: https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API |
| Web Crypto | Browser-native cryptographic primitives. | Capsule signing, replay hashes, sealed room backup, private identity, encrypted local rows. | Crypto does not save us from XSS; keep CSP/bridge gates tight. Source: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API |
| WebAuthn/passkeys | Phishing-resistant device/platform credentials. | Optional device-bound captain identity, signed guestbook stamps, high-trust room ownership recovery. | Needs careful UX; do not require account login. Source: https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Passkeys |
| WebCodecs | Low-level hardware-accelerated audio/video encode/decode. | Export replay clips/postcards, decode local sprite/video ambience, future creator tools. | Codec support and containers are nuanced; keep PNG/postcard first. Source: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API |
| Web Audio/AudioWorklet | Low-latency procedural/game audio in the browser. | Tide ambience, UI feedback, room instruments, co-op pings, adaptive music. | Audio playback usually needs user interaction; mute and reduced-motion/audio settings required. Source: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet |
| Gamepad API | Browser access to game controllers. | Desktop/TV dock mode, controller-friendly build and wave controls. | Mapping differs by device; must be optional. Source: https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API |
| File System Access | User-visible import/export on supporting browsers. | Save room capsules, load mod packs, export replay bundles. | Not universal; use download/share fallbacks. |

### 10.13 Pioneering browser-based game model

Docklands should pioneer a **local/edge/private** stack:

| Layer | Runs where | Responsibility | Privacy posture |
|---|---|---|---|
| Device world engine | browser worker/Wasm | room sim, crew sim, wave sim, replays | private by default |
| Device renderer | browser canvas/WebGPU/WebGL | room visuals, customization, animation | no network required |
| Device storage | IDB/OPFS | room, avatar, inventory, guestbook, replays | encrypted/redacted where needed |
| Shippie bridge | local container runtime | permissions, intents, ledger, egress gates | user-readable capability calls |
| Edge rendezvous | Cloudflare DO / SignalRoom | join codes, presence relay, peer discovery | metadata visible, payload minimized/encrypted |
| Edge receipts | Shippie proof/checkpoint services | optional replay/capsule verification, backup | coarse proof only, no raw room payload |
| Peer mesh | WebRTC/WebTransport follow-up | live commands, transfers, co-op play | peer-to-peer where possible |

This creates a different category from a normal web MMO:

- The room does not disappear when the server is down.
- The server does not need to own the save file.
- A friend can play a snapshot without both players being online.
- Live mode upgrades the room, it does not define it.
- Cross-app achievements can become room objects without a central profile database.
- Trust Ledger makes multiplayer, share, sync, and telemetry visible as product UI.

### 10.14 Browser ambition ladder

| Level | Target | What ships |
|---|---|---|
| Level 1 - Great web showcase | Canvas renderer, IDB save, service worker, share capsules, SignalRoom live room | Buildable first release |
| Level 2 - Private world engine | Worker simulation, OPFS asset cache, WebCrypto receipts, sealed checkpoints, BroadcastChannel tabs | Strong Shippie proof |
| Level 3 - Edge co-op | WebRTC peer data, edge rendezvous, replay verification, optional WebTransport spectators | Viral multiplayer |
| Level 4 - Pioneering browser game | WebGPU renderer, Wasm engine, AudioWorklet ambience, WebCodecs replay export, passkey captain identity | Category-defining demo |

Build Level 1 and Level 2 first. Prototype Level 4 visuals early so the game feels ambitious, but do not let WebGPU/WebCodecs become release blockers.

### 10.15 Private gaming invariants

- No raw room payload in telemetry.
- No central Shippie account required to own a room.
- No server-authoritative inventory in v1.
- No public global chat.
- Room export/import always available.
- Live rooms reveal connection metadata; UI must say that plainly.
- OPFS/IDB use must be inspectable and clearable from the app.
- If browser storage is evicted, the player should recover from capsule/checkpoint, not support email.
- Shippie edge sees rendezvous and proof metadata; it should not need to read the room.
- Mods/custom assets are local packages with explicit permissions, not arbitrary remote script.

---

## 11. Safety, moderation, and trust

### 11.1 Defaults

- Invite-only rooms.
- No public global directory in v1.
- No public global chat.
- No real-money trading.
- No betting/chance economy.
- Host can mute/kick/lock at all times.
- Guest permissions are narrow by default.
- Guest gifts are blueprints/copies, not ownership transfer.
- Rate limit guestbook entries and blueprint gifts.
- Allow "private room" mode with no guestbook.

### 11.2 Chat modes

| Mode | Use |
|---|---|
| Emote-only | default for unknown guests or public demos |
| Preset phrases | safe co-op coordination |
| Free text | invite-only trusted peers |

Free text is not required for MVP. The Habbo feeling can be achieved first with emotes, stickers, role pings, and guestbook stamps.

### 11.3 Abuse handling

MVP controls:

- kick guest
- mute guest
- clear guestbook entry
- revoke current invite
- rotate room code
- export report bundle locally

Future:

- per-device trust list
- block list shared across rooms on same device
- signed guest reputation without central identity
- neighborhood moderation for opt-in groups

---

## 12. MVP slice

The MVP should be a one-room game that can be built and shipped as a showcase, not a forever MMO.

### 12.1 Must ship

1. Isometric starter room
   - 10x10 grid
   - place/move/rotate furniture
   - local save and reload
2. Crew-lite life sim
   - 4 crew members (Mira/Penn/Jax/Sol), each with a friendly tool (§8.2.1)
   - 5 needs, with morale as a live Tide buff
   - 6 furniture effects
   - simple routines/idle animations
3. The Beacon (§8.1.1)
   - dead-center, hearts (integrity) gauge
   - visible growth stages (at least 3) on Tide clears
   - power meter + **Beacon Pulse** ability
   - 1 lens socket + a few starter Lenses (full lens catalog can grow post-MVP)
4. Tower-defense engine
   - 5 waves, with manifest preview + 3·2·1 countdown
   - 4 gunk types + 1 mini-boss (Tide Brute)
   - 4 defense items with **range rings, distinct silhouettes, tap-to-explain** (§8.3.1)
   - deterministic replay hash
5. Upgrades
   - crew tool tiers (1→3) + one bond ultimate per role
   - 2 upgrades per defense item (visible on the model)
   - 10 blueprint unlocks
6. Live room — **co-op embodiment** (§8.2.2)
   - create/join code
   - 2-4 players, **each guest embodies a crew member** (asymmetric: host builds + owns Beacon, guests run tools)
   - presence/emotes, drop-in/drop-out → AI fallback
   - one live wave together; shared spoils + a blueprint copy to take home
7. Sharing
   - room postcard
   - "beat my tide" capsule
   - guest replay receipt
8. Shippie integration
   - arcade manifest
   - `game.completed`
   - `wave.cleared`
   - consume existing game/wave observations into trophies
   - Trust Ledger rows for live room/share/intents

### 12.2 Cut from MVP

- no full public neighborhood directory
- no open-ended user scripting
- no real-money currency
- no player-to-player item trading
- no marketplace-scale avatar economy; ship a strong local captain creator, not thousands of paid cosmetics
- no romance/family systems
- no native mobile shell dependency
- no central account
- no global leaderboard
- no AI NPC dialogue

### 12.3 First build milestone

**Milestone 1: Solo room that fights back**

Acceptance:

- player can place 6 object types
- path preview updates
- wave runs deterministically
- crew needs tick locally
- room survives reload
- emits `wave.cleared` and `game.completed`

**Milestone 2: Shareable dock**

Acceptance:

- generated room postcard image
- signed "beat my tide" capsule
- import capsule in another browser profile
- replay receipt validates

**Milestone 3: Open dock**

Acceptance:

- host creates join code
- guest joins
- presence and emotes sync
- co-op wave commands sync
- host can revoke invite

### 12.4 Build order

Recommended order:

1. **Engine first:** room document, pathing, command log, deterministic wave, tests.
2. **Room renderer:** isometric grid, objects, enemies, crew idle, mobile layout.
3. **Local persistence:** IDB stores, migrations, reload/offline proof.
4. **Builder:** tray, placement preview, item inspector, upgrades.
5. **Crew-lite:** needs, routines, stations, room effects.
6. **Rewards:** salvage, blueprints, reputation, first trophy consumption.
7. **Share:** postcard, beat-my-tide capsule, import, replay receipt.
8. **Live room:** create/join, presence, emotes, co-op roles, host revoke.
9. **Trust:** ledger rows and in-room trust/guestbook surface.
10. **Polish:** tutorial, motion, audio, haptics, screenshot QA.

Reason for this order: replay determinism and local persistence are load-bearing. If the room cannot be saved, hashed, replayed, and imported, multiplayer will only add noise.

### 12.5 Vertical slice definition

The smallest compelling slice is:

- one captain
- three crew
- one room
- twenty blueprints
- five waves
- one shareable challenge
- one live co-op wave
- one cross-app trophy
- one guestbook receipt
- one trust detail view

That slice is small enough to build and large enough to show the Shippie thesis.

### 12.6 Nice-to-have backlog

| Backlog item | Why it is deferred |
|---|---|
| Neighborhood directory | safety and moderation surface too large for v1 |
| General Wired-like scripting | easy to overbuild before fixed furniture proves fun |
| Deep avatar creator | not needed for first viral loop |
| Large NPC simulation | crew-lite should prove appetite first |
| Public leaderboards | conflicts with local-first/no-account thesis unless signed carefully |
| Real economy/trading | high scam/pay-to-win risk, low need for showcase |
| AI crew dialogue | expensive and not necessary for room/share proof |
| Multiple-room buildings | one room must become excellent first |

---

## 13. Implementation notes

### 13.1 Engine approach

Use a deterministic TypeScript engine:

```ts
type DocklandsCommand =
  | { t: 'place'; item: PlacedItem }
  | { t: 'move'; id: string; x: number; y: number; rot: 0 | 1 | 2 | 3 }
  | { t: 'upgrade'; id: string }
  | { t: 'assignCrew'; crewId: string; stationId: string }
  | { t: 'startWave'; seed: string }
  | { t: 'coOp'; peerId: string; action: CoOpAction; tick: number };
```

Rules:

- commands are the only mutation boundary
- engine snapshots are serializable
- rendering reads derived views
- tests run the same command log twice and compare hash

### 13.2 Rendering approach

Start with 2D DOM/CSS or Canvas, not Three.js.

Recommendation:

- Canvas for floor/items/enemies/projectiles
- absolutely positioned HTML for chat bubbles, tooltips, and inspector
- sprite sheet generated in-house or drawn as simple pixel assets
- no external image CDN

Reason: phone readability, deterministic screenshots, and low bundle risk matter more than 3D spectacle.

### 13.3 Asset policy

- local assets only
- no third-party IP
- no Habbo/Sims visual clone
- generated or hand-drawn bitmap sprites acceptable
- icon SVGs okay for UI controls, but room assets should be game-native sprites

### 13.4 Testing

Unit:

- pathfinding rejects blocked layouts
- wave seed determinism
- crew need tick
- command validation
- replay receipt hash
- blueprint unlock rules

Integration:

- local save/reload
- capsule export/import
- two-client Yjs room join
- intent emit/consume
- trust ledger row on share/live room

Manual/Playwright:

- mobile first screen not overlapped
- room canvas nonblank
- item placement works
- QR/share sheet fits
- live room with two pages sees both avatars

### 13.5 Showcase acceptance gates

Docklands counts as a Shippie showcase only when these are true:

| Gate | Acceptance |
|---|---|
| Five-second clarity | A fresh player can identify the room, Beacon, Tide route, and friend/share verbs from the first screen without reading lore. |
| Offline | After first load, a player can reload offline, edit the room, tick crew needs, and clear a wave. |
| Local persistence | Room, crew, inventory, trophies, and guestbook survive browser close/reopen. |
| Local multiplayer | Two browser contexts can join the same dock by code and see presence/emotes within 1 second nominal. |
| Live co-op | Host starts one wave, guest role commands affect the wave, and both clients finish with the same result hash. |
| Async share | A `beat-my-tide` capsule imports into a clean browser profile and produces a validating replay receipt. |
| Cross-app | At least one existing `game.completed` or `wave.cleared` observation appears as an in-room trophy. |
| Trust | Live-room open, share export, and observation emit/consume each produce redacted Trust Ledger rows. |
| Mobile | 390x844 viewport shows room, bottom rail, and inspector without text overlap or unusable targets. |
| Visual | Screenshot/postcard shows a beautiful actual room state, with Beacon, route, avatar, and recent story visible. |
| Browser ambition | The first release proves at least Level 1 and Level 2 of the browser ambition ladder, with one prototype path for WebGPU/WebCodecs/AudioWorklet polish. |
| No clone risk | Art, names, economy, and mechanics read as Shippie harbor life-defense, not Habbo/Sims imitation. |

### 13.6 Mockup artifact

Static mockups live at:

```
docs/superpowers/specs/docklands-mockups/index.html
```

The mockup covers:

- refined premise and game loop
- embedded browser-native canvas prototype
- interactive character creator
- owner room as the primary screen
- mobile build mode
- live co-op tide wave
- share, guestbook, and trust surfaces

The mockup is intentionally not a landing page. It starts with the character/room fantasy and treats the game surface as the product. The character controls and owner-room bottom rail are interactive enough to communicate direction, but are not wired to the Shippie runtime.

---

## 14. Why this is the right Shippie showcase

Docklands is stronger than a pure arcade game because it exercises the whole thesis:

| Shippie thesis | Docklands proof |
|---|---|
| Apps can be local-first | full solo room and crew save offline |
| Apps can become social without accounts | join-code live room |
| Data can travel as user-owned capsules | room postcards and tide challenges |
| Real-time can be optional, not mandatory | async replay works without co-presence |
| Cross-app intents are meaningful | other arcade wins become room trophies |
| Trust can be a product feature | player can inspect sync/share egress |
| The "OS" idea has a feeling | the room becomes a desktop/home for Shippie achievements |

It also avoids the trap of making Shippie look like "just a wrapper". A user who plays Docklands should feel:

> My game, my room, my friends, my data, same device or live together.

That is the OS idea in player language.

---

## 15. Open decisions

| Decision | Recommendation |
|---|---|
| Final name | Use Docklands unless brand review objects |
| Visual fidelity | Pixel-isometric, not voxel/3D |
| Free text chat in MVP | Defer; ship emotes/preset phrases first |
| General room scripting | Defer; ship fixed game furniture first |
| Cross-device owner sync | Start manual capsule; sealed checkpoint in follow-up |
| NPC depth | Keep crew-lite in MVP; no full Sims autonomy yet |
| Neighborhood directory | Defer until safety model is stronger |
| Monetization | None in showcase |
| Build package extraction | App-local first; extract sim package after replay tests harden |

---

## 16. Source summary

This spec intentionally keeps the Habbo lessons at the system level:

- Habbo's official current frame: avatar, friends, chat, rooms, games, achievements, prizes.
- Habbo help docs: credits/furni/shop/trading/groups/achievements/Wired/safety.
- Habbox/Habborator: historical context for Mobiles Disco, Hotelli Kultakala, and the old room-centered client culture.
- EA Sims pages: create characters, build homes, guide lives, explore neighborhoods, share creations.
- Popular game references: Minecraft creation/survival, Animal Crossing island life/sharing, Roblox creator/discovery platform, Fortnite Creative island rules/devices, Stardew multi-loop life RPG, Bloons TD 6 tower/upgrades/co-op/offline play, Clash Royale short real-time battles, Among Us local/online roles/tasks.
- MDN/browser docs: WebGPU, WebAssembly, workers, offline PWAs, IDB/OPFS, WebRTC, WebTransport, WebCrypto, passkeys, WebCodecs, AudioWorklet, Gamepad, BroadcastChannel, Web Locks.
- FROST research: OPFS/SSD timing side-channel risk, relevant to private browser gaming storage posture.

Primary sources used:

- [Habbo: What is Habbo?](https://www.habbo.com/playing-habbo/what-is-habbo)
- [Habbo Help: Credits](https://help.habbo.com/hc/en-us/articles/360011512280-What-are-Habbo-Credits)
- [Habbo Help: Furni](https://help.habbo.com/hc/en-us/articles/360011512940-What-is-Furni)
- [Habbo Help: Shop](https://help.habbo.com/hc/en-us/articles/360011619799-All-about-the-Habbo-Shop)
- [Habbo Help: Groups](https://help.habbo.com/hc/en-us/articles/360011512600-Groups)
- [Habbo Help: Achievements](https://help.habbo.com/hc/en-us/articles/360011512900-What-Are-Habbo-Achievements)
- [Habbo Help: Trading](https://help.habbo.com/hc/en-us/articles/4408726781842-Player-to-player-trading-in-Habbo)
- [Habbo Help: Wired Furni](https://help.habbo.es/hc/es/articles/360005259137--En-qu%C3%A9-consiste-el-Furni-Wired)
- [Habbo Help: Scamming](https://help.habbo.com/hc/en-us/articles/360011619259-About-Scamming)
- [Habbo Help: Bans/mutes/trade locks](https://help.habbo.com/hc/en-us/articles/360011619339-What-have-I-been-banned-muted-or-trade-locked-for)
- [Habborator: origin history](https://habborator.org/history/sub/origin.html)
- [Habbox Wiki: Habbo](https://habboxwiki.com/Habbo)
- [EA: The Sims Legacy Collection](https://www.ea.com/games/the-sims/the-sims-25th-anniv-edition)
- [EA: The Sims 4 features](https://www.ea.com/games/the-sims/the-sims-4/features)
- [Minecraft: About Minecraft](https://www.minecraft.net/en-us/about-minecraft)
- [Animal Crossing: New Horizons](https://animalcrossing.nintendo.com/new-horizons/)
- [Roblox: About](https://about.roblox.com/)
- [Epic: Fortnite Creative Island Settings](https://dev.epicgames.com/documentation/fortnite/understanding-island-settings-in-fortnite-creative)
- [Stardew Valley](https://www.stardewvalley.net/)
- [Bloons TD 6 on Steam](https://store.steampowered.com/app/960090/Bloons_TD_6/)
- [Clash Royale](https://supercell.com/en/games/clashroyale/)
- [Among Us](https://www.innersloth.com/games/among-us/)
- [MDN: WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
- [MDN: WebAssembly](https://developer.mozilla.org/en-US/docs/WebAssembly)
- [MDN: Web Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
- [MDN: Offline and background operation for PWAs](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation)
- [MDN: IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [MDN: Origin private file system](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
- [MDN: WebRTC data channels](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels)
- [MDN: WebTransport API](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API)
- [MDN: Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [MDN: Passkeys](https://developer.mozilla.org/en-US/docs/Web/Security/Authentication/Passkeys)
- [MDN: WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
- [MDN: AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet)
- [MDN: Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API)
- [MDN: Broadcast Channel API](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API)
- [MDN: Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)
- [FROST: Fingerprinting Remotely using OPFS-based SSD Timing](https://hannesweissteiner.com/publications/frost/)

---

## Appendix A — Competitive analysis (background)

> Moved out of the main flow so the buildable concept (§4 onward) leads. This is the research that informed the design — Habbo Hotel, The Sims, and a teardown of popular games. Section numbers (§2, §3, §3.5) are preserved so existing cross-references still resolve.

## 2. Habbo Hotel review: how it worked and why it mattered

### 2.1 Origin and product frame

Habbo grew out of late-1990s Finnish web chat experiments. Habborator's history traces the line from **Mobiles Disco** in 1999, where users could create a character, chat at a bar, and dance, to **Hotelli Kultakala** in August 2000, the Finnish precursor to Habbo Hotel. Habbox's history similarly describes Habbo as emerging from Sampo Karjalainen and Aapo Kyrola's Mobiles Disco project and launching internationally after the Finnish hotel concept proved out.

Sources:

- [Habborator: Habbo origin history](https://habborator.org/history/sub/origin.html)
- [Habbox Wiki: Habbo history and features](https://habboxwiki.com/Habbo)

The important historical point is not the hotel theme. It is that Habbo began as a simple graphical social room, then became a world because players could own rooms, dress avatars, decorate with objects, host events, and make their own games.

### 2.2 Core loop

The classic Habbo session looked roughly like this:

1. Log in as a persistent avatar.
2. Land in the hotel client, usually with a home/default room and friends/console access.
3. Use the Navigator to find public rooms, user rooms, events, or popular spaces.
4. Enter a room with a small isometric avatar.
5. Chat through overhead bubbles and simple avatar actions.
6. Visit friends, trade, attend games/events, decorate rooms, or roleplay.
7. Earn or show off badges, rare furniture, group identity, room design, and social reputation.

The current official Habbo description still centers the same core: create an avatar, make friends, chat, build rooms, design/play games, and compete for achievements/prizes. That is the durable product spine.

Source:

- [Habbo: What is Habbo?](https://www.habbo.com/playing-habbo/what-is-habbo)

### 2.3 Rooms were identity, not just levels

Habbo's rooms were the core creative unit:

- A room was a player's home, status display, stage, shop, maze, office, game, agency, club, or private hangout.
- The isometric constraint made rooms readable and screenshot-friendly.
- A room owner could shape social behavior with layout: queues, doors, teleports, rollers, barriers, chairs, counters, stages.
- Player-made rooms gave the world scale without Sulake hand-building all content.

Habbo's own furni help explains the basic object loop: buy furni, receive it in inventory, place it into a room, move/drop it, sit/lie on it, double-click interactive items, and use linked teleports or rollers to create movement logic.

Source:

- [Habbo Help: What is Furni?](https://help.habbo.com/hc/en-us/articles/360011512940-What-is-Furni)

Docklands lesson: the "room" must be the player-owned save file and the social URL. It cannot be a decorative lobby around a separate game. The room itself must be playable.

### 2.4 Furniture was utility, status, economy, and game logic

Habbo furniture worked at four layers:

| Layer | Habbo use | Docklands translation |
|---|---|---|
| Decoration | Express taste and identity | Harbor decor, furniture, trophies, ship parts |
| Interaction | Sit, drink, teleport, roll, trigger | Workstations, beds, lamps, traps, turret bases |
| Status | Rare/seasonal/prize items | Earned blueprints, event trophies, no real-money rarity |
| Logic | Wired triggers/effects/conditions | Simple room automation, defense scripting, visit rules |

Credits funded the extras economy. Habbo's help docs say credits buy furniture, club membership, clothing, pets, group furni, and credit furni that can be traded. The shop separated items into categories and surfaced rare, seasonal, and prize objects. Trading gave objects a social life beyond purchase.

Sources:

- [Habbo Help: What are Habbo Credits?](https://help.habbo.com/hc/en-us/articles/360011512280-What-are-Habbo-Credits)
- [Habbo Help: All about the Habbo Shop](https://help.habbo.com/hc/en-us/articles/360011619799-All-about-the-Habbo-Shop)
- [Habbo Help: Player to player trading](https://help.habbo.com/hc/en-us/articles/4408726781842-Player-to-player-trading-in-Habbo)

Docklands lesson: avoid a cash economy, but keep the magic of objects having stories. A sofa should matter because it hosted a raid party, blocks enemy paths, raises crew comfort, or came from a friend's blueprint, not because it cost real money.

### 2.5 Groups, badges, achievements, and room rights created social proof

Habbo groups had names, descriptions, home rooms, badges, team colors, membership limits, and controlled room-building rights. Group members could help design a home room while retaining ownership of the furni they placed. Achievements awarded badges, rewards, and level progression points, then displayed badges on the profile.

Sources:

- [Habbo Help: Groups](https://help.habbo.com/hc/en-us/articles/360011512600-Groups)
- [Habbo Help: Achievements](https://help.habbo.com/hc/en-us/articles/360011512900-What-Are-Habbo-Achievements)

Docklands lesson: social proof should be visible in-room, not hidden in a profile modal. Badges become wall plaques, crew uniforms, dock flags, guestbook stamps, room titles, and event banners.

### 2.6 User-created games were the real retention engine

Habbo's official framing included building and playing games, but much of the creative energy came from players inventing games with furniture and room rules:

- mazes and obstacle courses
- races and queue games
- falling furni and musical-chairs-like games
- roleplay workplaces and agencies
- event rooms, badge hunts, game shows, and fan-site competitions
- later, Wired furniture for triggers, effects, and conditions

Habbo's Spanish help article on Wired explains the concept clearly: Wired furni combine triggers, effects, and optional conditions. Examples include password doors, pressure plates, welcome messages, lamps controlled by switches, obstacle courses, traps, and games controlled by arrow tiles.

Source:

- [Habbo Help: Wired Furni](https://help.habbo.es/hc/es/articles/360005259137--En-qu%C3%A9-consiste-el-Furni-Wired)

Docklands lesson: the first version should not ship a general programming language. It should ship a few "game furniture" pieces that make rooms playable immediately:

- path blocks
- turret mounts
- trap tiles
- pressure plates
- spawn gates
- reward chests
- doors and locks
- visitor rules

Then expand into a tiny Wired-like rule layer later.

### 2.7 Virality came from rooms, scarcity, events, and social friction

Habbo was viral because players always had a reason to pull someone in:

- "Come see my room."
- "Join this event before it fills."
- "Trade me."
- "Help me win this badge."
- "Work at this agency."
- "Race through this maze."
- "Look at this rare item."
- "Meet me in this room."

The room URL/invite and the screenshot were the social object. Rooms were small enough to understand instantly, but expressive enough to show taste and status.

Docklands lesson: every player action should create an easy share:

- a room postcard image
- a defense replay
- a join code for a live raid
- a guestbook receipt
- a blueprint gift
- a "beat my tide" challenge
- a neighborhood event card

### 2.8 Safety and economy problems to avoid

Habbo's magic came with real risks:

- scams around furni, credits, fake free-credit sites, and account compromise
- "pay to stay" or pay-to-play schemes in player rooms
- gambling/chance games and room freezes/trade locks
- status tied too strongly to paid or rare objects
- opaque enforcement and moderation tension
- public chat and youth-safety risks

Habbo's help center has explicit scam guidance and says gambling/chance-game betting can trigger trade locks, bans, or frozen rooms.

Sources:

- [Habbo Help: About Scamming](https://help.habbo.com/hc/en-us/articles/360011619259-About-Scamming)
- [Habbo Help: Banned, muted, or trade-locked reasons](https://help.habbo.com/hc/en-us/articles/360011619339-What-have-I-been-banned-muted-or-trade-locked-for)

Docklands non-negotiables:

- no real-money currency in the showcase
- no casino/chance betting loop
- no paid item trading
- no global public chat in v1
- invite-only rooms by default
- host controls: mute, kick, lock, reset
- visible egress/trust ledger rows
- portable user-owned save data

### 2.9 Habbo's product lessons in one table

| Keep | Change | Avoid |
|---|---|---|
| Isometric rooms | Harbor/shipyard world, not a hotel clone | Nostalgia-only pixel copy |
| Avatar presence | Crew/household simulation | Anonymous public global lobbies |
| User-owned spaces | Local-first room capsule | Central account ownership as the core |
| Furniture as story | Earned blueprints and gameplay utility | Real-money rare economy |
| Social proof | In-room trophies and guestbook receipts | Pay-to-win status |
| Room games | Defense waves and room rules | Gambling/chance rooms |
| Badges/events | Seasonal local challenges | Opaque moderation and scams |
| Lightweight chat | Emotes/presets plus private host-controlled chat | Unsafe public chat surface |

---

## 3. The Sims review: what to borrow

The Sims is useful because it solves a different half of the problem: players do not only want a room to show other people; many want to nurture a tiny world offline.

EA describes the original Sims loop as creating Sims, building homes, and guiding lives through careers, friendships, romance, or chaos. EA's Sims 4 feature page centers creating a world, customizing Sims/homes, visiting neighborhoods, throwing parties, and sharing creations through the Gallery.

Sources:

- [EA: The Sims Legacy Collection features](https://www.ea.com/games/the-sims/the-sims-25th-anniv-edition)
- [EA: The Sims 4 features](https://www.ea.com/games/the-sims/the-sims-4/features)

Core Sims lessons for Docklands:

| Sims idea | Why it works | Docklands version |
|---|---|---|
| Create-a-Sim | Identity and attachment before gameplay pressure | Create captain + 2 crew traits |
| Build/Buy mode | Players enjoy making spaces even without "winning" | Build harbor rooms and defensive paths |
| Live mode | The world runs, needs emerge, drama appears | Crew routines, needs, visitors, events |
| Needs | Soft goals give the day texture | Comfort, spark, grit, morale, safety |
| Skills/careers | Progression becomes character identity | Builder, tactician, host, trader, scout |
| Relationships | Tiny people make places meaningful | Crew bonds, friend visits, guestbook memory |
| Parties/venues | Social spaces create stories | Open-room events and co-op tide nights |
| Gallery/sharing | Creations travel beyond the save | Room postcards, capsules, blueprints |
| Chaos | Failure stories are memorable | Broken generator, messy room, surprise raid |

The key addition from the user's note: Docklands should not be only a Habbo-like lobby plus tower defense. It should be a compact life sim where the room is alive when nobody else is connected.

---

## 3.5 Popular game review: borrowed magic

Docklands should borrow the durable design lessons from popular games without copying their worlds, economies, or platform assumptions. The target is not "Habbo plus tower defense"; it is a browser-native room that gives players the same instant ownership that Minecraft, Animal Crossing, Roblox, Fortnite Creative, Stardew Valley, Among Us, Clash Royale, and Bloons TD 6 each create in different ways.

### 3.5.1 What to steal without copying

| Game | What makes it sticky | Docklands translation |
|---|---|---|
| Minecraft | A simple sentence explains the whole game: explore your world, survive the night, create anything. Blocks make creativity tactile, and survival pressure gives builds a reason to exist. | The dock is a tiny buildable world. Day is create/care. Tide is survive. Furniture is the block language, but every object has home value and defense value. |
| Animal Crossing: New Horizons | A personal island, daily rhythms, collecting, decorating, visitors, and sharing give players a low-pressure identity space. | The room is a personal dockhouse. Crew routines, seasonal salvage, guestbook stamps, and room postcards create cozy return reasons between waves. |
| The Sims | Character attachment, needs, home-building, and social drama make the house meaningful even without a score. | The captain and crew make the room feel alive. Needs are soft levers that affect crafting, hosting, and defense, not chores that punish absence. |
| Roblox | Viral discovery comes from user-made experiences, lightweight identity, and social play around creator-made spaces. | Each room is a tiny experience. V1 should support templates, signed capsules, and friend invites before any public directory or user scripting. |
| Fortnite Creative / UEFN | Islands, devices, props, and settings let creators define rules and spectacle quickly. | Game furniture becomes safe "devices": Tide Gate, Bell Turret, Net Launcher, Pressure Plate, Guestbook Stand, Radio Mast, and Beacon Core. |
| Stardew Valley | Many gentle loops coexist: farming, crafting, relationships, exploration, combat, decoration, and community restoration. | Docklands should offer multiple useful verbs in one room: craft, host, repair, upgrade, decorate, defend, gift, and restore the neighborhood. |
| Bloons TD 6 | Clear paths, readable enemies, tower upgrades, heroes, co-op, events, trophies, and offline play make defense deep but friendly. | Tide route preview must be unmistakable. Crew are the "heroes"; furniture upgrades visibly change art; offline defense is a first-class mode. |
| Clash Royale | Three-minute real-time matches, card-like loadouts, towers, trophies, and fast stakes make competitive play readable on mobile. | Tides are short, dramatic sessions. The room loadout is visible at a glance; the win condition is "protect the Beacon", not a complicated score. |
| Among Us | Social roles, simple tasks, local/online play, short sessions, and memorable group moments create instant party stories. | Live Tide should give guests clear roles: Fixer, Spotter, Charger, Host. Coordination uses pings/emotes first; tasks are physical room actions. |

Sources:

- [Minecraft: About Minecraft](https://www.minecraft.net/en-us/about-minecraft)
- [Animal Crossing: New Horizons official site](https://animalcrossing.nintendo.com/new-horizons/)
- [EA: The Sims 4 features](https://www.ea.com/games/the-sims/the-sims-4/features)
- [Roblox: About](https://about.roblox.com/)
- [Epic: Fortnite Creative Island Settings](https://dev.epicgames.com/documentation/fortnite/understanding-island-settings-in-fortnite-creative)
- [Stardew Valley official site](https://www.stardewvalley.net/)
- [Bloons TD 6 on Steam](https://store.steampowered.com/app/960090/Bloons_TD_6/)
- [Clash Royale official site](https://supercell.com/en/games/clashroyale/)
- [Among Us official site](https://www.innersloth.com/games/among-us/)

### 3.5.2 Feature ingredients worth implementing

| Ingredient | Player value | Docklands implementation |
|---|---|---|
| One visible goal | People understand before reading. | Protect the glowing Beacon in the middle of the room. |
| Day/night transformation | Same space has two emotional states. | Day room: cozy, crew routines, crafting. Tide room: path glows, furniture unfolds, water rises. |
| Player-authored stage | The room is a personal expression and a level. | Every placed object changes decor, needs, pathing, defense, or share value. |
| Short challenge session | Easy to invite, replay, and post. | Three-minute Tide seeds with replay receipts and "beat my tide" capsules. |
| Social roles | Guests know how to help. | Fixer repairs, Spotter marks, Charger powers, Host triggers Beacon ability. |
| Visible upgrades | Progress reads without opening a spreadsheet. | Upgraded furniture changes silhouette, glow, sound, and tile footprint warnings. |
| Collection wall | Achievements become physical. | Cross-app trophies, replay plaques, guestbook stamps, seasonal salvage shelves. |
| Creator safety rail | Player creativity without platform chaos. | Fixed game furniture and templates first; no public script marketplace in v1. |
| Offline legitimacy | The game still feels real without servers. | Full solo build/life/defense loop, local save, local capsules, offline replay validation. |
| Share as play | Viral object is interactive. | Room postcard opens into a playable snapshot, not only an image. |

### 3.5.3 What not to borrow

| Pattern | Why not | Docklands rule |
|---|---|---|
| Habbo-style paid rare economy | Scam/status pressure and pay-to-win risk. | Earned blueprints, copyable gifts, no real-money item trading. |
| Roblox-scale open UGC on day one | Safety, moderation, discovery, and quality burden. | Friend capsules and curated templates before public discovery. |
| Fortnite-scale authoring tools too early | Tooling can eclipse the game. | Ship fixed room devices first, then add tiny rules once the core room is fun. |
| Sims-style deep life simulation in MVP | Scope can explode before the defense loop lands. | Crew-lite needs and routines first. |
| Clash-style competitive ladder | Conflicts with local-first/no-account v1. | Signed friend receipts and local room titles before global ranking. |
| Among Us deception loop | Needs moderation and can fight the cozy room premise. | Borrow roles/tasks, not betrayal. |

### 3.5.4 The synthesis

Docklands should feel like:

> The creativity of Minecraft, the coziness of Animal Crossing, the avatar attachment of The Sims, the room culture of Habbo, the quick co-op clarity of Among Us, and the tactical readability of Bloons/Clash - but local-first, private, browser-native, and Shippie-shaped.

That synthesis gives the game a premise that lands fast:

1. This is my floating room.
2. The Beacon is mine to protect.
3. My furniture is useful.
4. My friends can dock in.
5. My room can travel as a playable object.
