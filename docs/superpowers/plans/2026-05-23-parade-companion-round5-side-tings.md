# Parade Companion — Round 5: Side tings (group structure)

> Companion to rounds 1–4. Focused on how groups, side tings, and solo users fit together.
> Date: 2026-05-23. Parade: 2026-05-31 — 8 days out.
> Constraint: keep it simple. Add as little new model as the goal allows.

---

## 1. The mental model — *one primary group · many side tings*

There are three things on the map:

| Thing | What it is | Who broadcasts | Cap |
|---|---|---|---|
| **The bus** | the parade bus position | crowd-sourced sightings + schedule | 1 (global) |
| **Your primary group** | the crew you're with — you appear in it, you see them | you + your group's members | 1 per user |
| **Side tings** | other groups you've added to *watch* on your map | their members; you don't appear in their app | up to 5 |

**"Friend tracking" = your primary group**; a friend who joins becomes a member.
**"Group tracking" = side tings**: any other crew whose dots you want on your map without joining.

A user who's going alone is the same as having a *one-person* primary group: they have a code their friends can use to watch them as a side ting, or to join them as members.

### Why this works

- **One protocol, three lenses.** Every shareable identity is a relay room with a key. The bus is one; your group is one; each side ting is one. Same plumbing, three visual treatments.
- **No new server concept.** "Watch only" is enforced *client-side* — the watcher's app simply doesn't broadcast its position to the watched room. (See §6 for the v1.1 hardening.)
- **No discovery.** You only see groups you've been *given the code for* — by QR, by short code, or by URL. Privacy by construction; no parade-wide directory.

---

## 2. UX flows

### 2a. Going alone (no group)

- **Group screen** shows a single card: *"Just you. Share your dot so friends can find you."* with a **Share my dot** button.
- Tapping it creates a one-person group (the user is the only member), generates the invite QR + short code, and from then on the user appears on the map as if they had a group of one.
- The Group screen now shows that as their *primary group* with the same affordances as a multi-person group.

### 2b. Going with a group (the existing flow, lightly relabelled)

- Plan screen → name + members + meeting points (already there).
- Save → invite QR/code (already there).
- Friends scan, see the **import preview**, and pick a role (§2c).

### 2c. Receiving someone else's code — the two-button choice

After scanning a QR or pasting a code, the receiver sees the standard preview card. The bottom row now has **two** buttons instead of one:

```
┌───────────────────────────────────────────────────┐
│  Join "The Invincibles"?                          │
│  5 members · meeting at Outside Emirates, 8am     │
│                                                   │
│       [ Watch on map ]   [ Join group ]           │
└───────────────────────────────────────────────────┘
```

- **Watch on map** — adds it as a side ting. You see their dots; you don't appear in their app. No commitment.
- **Join group** — becomes your primary group; you start broadcasting your position there. If you already have a primary, prompt: *"You're in **The Arsenal Mob**. Switch?"* — switch or cancel.

### 2d. Adding a side ting from somewhere else

A small **"Add side ting"** affordance on the Group screen — opens the same scanner/paste sheet. The flow ends with the side-ting added, the watcher's primary unchanged.

### 2e. Removing or switching

- Side ting list has an **×** on each row to remove.
- Primary group has a **Leave group** option in its overflow menu; leaving drops you back to "Just you" (with a quietly-kept one-person group, so friends watching you still see your dot).

---

## 3. Visual treatment on the map

| Layer | Colour | Marker | Label |
|---|---|---|---|
| Your dot | **red** (Arsenal) | filled circle, pulsing accuracy ring | "You" |
| Primary group members | **sage** | filled circle | first name |
| Side ting members | **gold** | filled circle + small mono-caps initial chip beside (e.g. `IN` for "Invincibles") | first name |
| Bus | **red** | route segment glow + central pin | "Bus" |
| Reports (crowd/road/help) | gold/ink/red-deep per type | small annotation pin | type label |

**Multiple side tings** share the gold colour; the **2-letter chip** distinguishes them (taken from the first two letters of the group name, mono caps). With a cap of 5 side tings, this stays scannable.

**Layer toggle chip row** appears above the map — tiny mono pills:

```
[ Bus ●  Friends ●  Side tings ○  Reports ●  My taps ● ]
```

Tapping a pill mutes/unmutes that layer. Default: Bus + Friends + My taps on; Side tings + Reports on as data arrives. The toggle uses the **`icon-toggle`** primitive shipped in round 4 so it carries the design language with zero new CSS.

---

## 4. Group screen layout (refactor of the current Plan screen)

Stacked cards, top to bottom:

1. **Your group** card (the existing plan content, now with a clearer header).
   - If you have a multi-person group: name · member count · *"Show invite"* button.
   - If you're alone: *"Just you. Share your dot so friends can find you."* + **Share my dot** button.
2. **Plan card** — meeting points, fallback, if-separated, leave plan. Unchanged.
3. **Side tings card** — list of watched groups, each row: name · member count · last-activity age · `×` to remove. An **Add side ting** button at the bottom.
4. **Members card** (Round 4 spec) — live roster of your primary, age-stamped per member.
5. **Inbox card** (Round 4 spec) — preset signals + activity.

Side tings sit between Plan and Members so the order reads *"who we are · where we're meeting · who else we're watching · who's where."*

---

## 5. Sharing protocol — what travels in the QR/code

The existing share fragment already carries the plan. Extend its payload with the **room id + secret**, and add a **role hint** the receiver respects (no enforcement):

```ts
type SharePayload = {
  v: 2;
  n: string;                  // group name
  m: string[];                // member display names (first names)
  p: PlanPoint;               // primary meeting
  f: PlanPoint;               // fallback meeting
  s: string;                  // if-separated text
  l?: string;                 // leave plan
  // NEW:
  r: {
    roomId: string;           // relay room id
    roomKey: string;          // symmetric encryption key
    issuedAt: string;         // ISO
  };
  // OPTIONAL role hint — receiver still chooses; this is what the sender suggests
  role?: 'join' | 'watch';
};
```

- Backwards-compatible: v1 plans (without `r`) still decode as plan-only; receiver gets no live relay, just the meeting points.
- A short **6-character code** (e.g. `IN-7K3M`) is derived from `roomId` (first 6 chars of a base32 hash). Show it on the invite screen as a typeable fallback when the QR can't scan.

The receiver's import sheet shows the preview and picks **Watch on map** or **Join group**. Their choice is stored locally; nothing about it goes back to the sender.

---

## 6. Privacy + abuse model

**v1 (parade day) — honor-system "watch only."**
- A symmetric `roomKey` decrypts and encrypts. Anyone with the key technically *could* publish to the room. The app simply doesn't expose a "publish to side ting" affordance.
- For a one-week event with codes shared between friends, this is sufficient. The social trust does the work.
- Members of a group can **mute** any member locally (cosmetic; same affordance as round 4 §3a.5).

**v1.1 (post-parade hardening, if abuse becomes real) — publish/read key split.**
- Each relay room carries a `publishKey` (asymmetric — held only by formal members) and a `readKey` (the symmetric decryption key shared in invites).
- Watchers get the `readKey` only. They can decrypt but their packets won't verify against the `publishKey` so members' apps drop them.
- Adding a watcher → adding a member becomes a formal "Promote to member" step that hands over the `publishKey`.

This separation is **future-compatible** with v1: extend `SharePayload.r` with an optional `publishKey`; v1 ignores it; v1.1 enforces.

---

## 7. Caps + edge cases

| Case | Behaviour |
|---|---|
| Cap of side tings | **5**. Adding a 6th: prompt "Remove which one?" with the list. |
| Cap of members per group | Codex's existing 12-member cap on `members[]` stays. |
| Receiver already has a primary, taps *Join group* | Prompt: *"You're in **{current}**. Switch to **{new}**?"* — Switch · Cancel. Old primary becomes either a side ting (offered) or is dropped. |
| Receiver has the same group already (re-scan) | No-op + toast: *"Already in **{name}**."* |
| Two side tings have the same first-2 chars (`In` for *Invincibles* and *Insider*) | Use first-letter + last-letter (`Ir`, `Ir` → if still clash, use a digit suffix). Edge case; bounded by the cap of 5. |
| Side ting's relay drops out for > 10 min | The side ting's dots fade to outline + label *"last seen 12 min ago"*. The side ting itself doesn't disappear from the list. |
| Solo user creates a one-person group | Treated exactly like a multi-person primary. Their invite QR works the same; friends can watch or join. |
| User wants to be invisible to a side ting | They never appeared in the side ting (watch is one-way). To be invisible to their **primary**, they leave the group. |

---

## 8. Codex pickup list — concrete tasks

These slot into the round-4 work; no architectural reshuffle needed.

**P0 (parade-day target)**
- Extend `SharePayload` to v2 with `r: { roomId, roomKey, issuedAt }` + optional `role` hint. Keep v1 backwards-compat in `decodePlan`.
- New local store: `side_tings` table in `shippie-db.ts` — `{ roomId, roomKey, name, addedAt, lastSeenAt }` rows. Cap 5.
- Two-button **import preview** sheet (replaces the single-button banner in `App.tsx` flow):
  - "Watch on map" → `addSideTing(payload)` + jump to Group.
  - "Join group" → existing import path (set as primary).
- **Group screen restructure** — render *Your group* / *Plan* / *Side tings* / *Members* / *Inbox* cards as outlined in §4. Reuse the round-4 design primitives (paper cards, mono labels, `icon-toggle`).
- **Solo "Share my dot"** affordance when no plan exists — creates a one-person group + invite.
- **Map layer toggle chip row** — pills above the map, controlling visibility per layer (Bus / Friends / Side tings / Reports / My taps). Reuse `.icon-toggle` from round 4.
- **CorridorMap render** for side tings — gold dots with 2-letter chips (deterministic from group name).

**P1 (try)**
- Per-side-ting relay subscription with the same throttle as the primary (≤ 1/30 s reads).
- Remove/switch UI on the Group screen (×, Leave, Promote-to-primary, Promote-side-ting-to-primary).
- Receiver clash naming for similar group names (§7).
- Side ting last-seen fade behaviour on the map.

**P2 (post-parade)**
- Publish/read key separation for true watch-only enforcement (§6).
- A "Friend pin" shortcut: scan a QR that's a one-person group's invite and add as a side ting in one tap (no role prompt).
- A small "Find a side ting on the map" affordance — tap a side ting in the list → centres the map on their newest dot.

---

## 9. Decision points for you

Two questions that gate the build:

1. **Cap on side tings — 5 (recommended) or different?**
   5 keeps the map readable, the layer toggle simple, and the relay cost bounded. 3 would be tighter; 8+ starts to blur on the canvas.
2. **Default role on a `?role=watch` hinted code — auto-watch, or always prompt?**
   Auto-watch is faster for organisers handing out posters with "watch the bus relay" codes. Always-prompt is safer for friend codes. Recommend: **always prompt**, with the buttons pre-ordering by the hint (so a watch-hinted code shows **Watch on map** as the leftmost/primary button).

---

## 10. Hard rules carried in

1. **Side tings are read-only.** No app surface ever offers to broadcast into a watched room.
2. **Every dot still carries age + source.** Watched-group dots fade to outline > 10 min.
3. **The map stays legible.** Cap 5 side tings; gold + 2-letter chip for differentiation; never per-group hues beyond the design palette.
4. **Solo is a first-class state.** "Just you" isn't a degraded UX — it's a one-person group with the same affordances.
5. **No discovery, ever.** You only see groups you have a code for.
6. **The design language holds.** Paper · Arsenal red for you · sage for your group · gold for side tings · mono for data · sharp corners. No new fonts, no new colours.
