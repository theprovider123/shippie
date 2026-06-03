# Docklands — Survival Revision v2 ("Tide Siege")

> **Status:** design revision to `2026-06-02-shippie-docklands-game-design.md`. Supersedes the loop framing in §6–§7 and extends §8. Kept from the base: isometric room, the Beacon, friendly-junk framing, local-first + co-op, Shippie proof/Trust.
>
> **v2 (this rewrite) — the genre is now explicit:** a **maze tower-defence ↔ survival-action hybrid**. You earn credits each round and spend them on **two tracks** — *defences/terrain* and *yourselves*. You **dig land to lengthen the enemy's path**; enemies have **stamina and tire over distance**; and when a wall finally breaks, **you drop in and fight them by hand**, where your **self-upgrades and evolutions** decide if you hold. The aim: *smart but intuitive* — deep because the systems interlock, easy because every choice is one priced tap with a visible effect.

## 0. What v2 changes (and why)

The COD-Zombies framing of v1 was clearer but generic. Devante's direction sharpens it into something more original:

| v1 | v2 |
|---|---|
| Buy defences | Buy defences **or upgrade yourselves** — two spend tracks |
| Fixed lanes | **Dig/reclaim land to lengthen & wind the path** |
| Enemies just have HP | Enemies have **HP *and* stamina** — distance tires them |
| Defences clear everything | Defences are a *filter*; when a wall breaks, **you melee the leak** |
| Flat crew | **Self-upgrade trees + evolutions** (gated by rare Cores) decide breach fights |

## 1. Core loop — two phases, two spend tracks, one number

Rounds alternate, exactly as before, so the loop stays legible:

```
 ┌──────── PREP (timer) ────────┐         ┌──────── DEFEND (the round) ────────┐
 │  spend Credits on TWO tracks: │  ───▶   │ enemies path the (dug) route,       │
 │  ▸ DOCK   land · towers ·     │         │ tiring as they go · towers thin     │
 │           walls · traps       │         │ them · walls hold the line · when   │
 │  ▸ CREW   skills · gear ·     │  ◀───   │ a wall breaks YOU fight the leak    │
 │           abilities · evolve  │  reward │ · protect the Beacon · earn credits │
 └───────────────────────────────┘         └─────────────────────────────────────┘
```

- **The ROUND is the hero number** ("ROUND 7"); the game answers *how far can your dock get?*
- **The phase is the instruction:** `PREP — spend & build · 0:12` or `DEFEND — survive!`. Build UI shows only in PREP (progressive disclosure = the core clarity win).
- **PREP has two tabs:** **Dock** (defences + terrain) and **Crew** (your characters). One currency, two places to spend it — the central strategic tension.
- **No win, only "how far."** You play until the Beacon falls. Result = a **round survived** score (the shareable brag).

## 2. The path & digging land (the spatial puzzle)

- The dock has **one visible route** from the gate to the **home zone** around the Beacon. The route is always drawn as a glowing line — never ambiguous.
- In PREP you can **Reclaim land** (a priced action on highlighted edge tiles): each purchase **extends and winds the route**, pushing the gate further out. Longer route = the enemy walks further.
- **Why longer helps:** more seconds under tower fire, and more **stamina drain** (§3) — a long maze can exhaust weak enemies before they arrive.
- **Why longer costs:** credits + a round to **dredge** (the new land is "wet" for one round), and your towers/crew now cover a longer line, so coverage thins. *That* trade-off is the smart layer: lengthen to attrit, or stay compact to concentrate fire.
- (We chose **dig-to-extend a set path** over freeform wall-mazing: it keeps the route legible for a new player while still giving the "make the journey longer" decision.)

## 3. Enemy stamina / fatigue (the attrition mechanic)

Every enemy carries **two bars: HP and Stamina.**

- **Stamina drains with distance walked.** As it falls: enemy **slows**, then **stops to rest** (a sitting duck for towers/traps), then — if the path is long enough — **collapses into salvage** (a free clear; small **Core** chance). Distance literally fights for you.
- **Profiles differ by type:** Bottle Skippers tire fast (great maze fodder); Rust Crabs are slow but high-stamina; **Brutes/bosses barely tire** (you *must* out-damage them). So digging never trivializes the game — it shifts which threats you out-walk vs. out-gun.
- **Counterplay both ways:** enemies **rest at chokepoints** → you mine rest-spots with **traps**; some types get a **"second wind" / rage** when exhausted (a fast last dash) → tension near the wall.
- **Readout:** HP bar (teal) + a thinner **stamina bar (amber)** under each enemy; tired enemies visibly hunch, slow, and puff.

## 4. Layered defence & the breach (TD → action)

Three lines, each failing into the next — this is the hybrid's heart:

1. **The maze + towers + traps** thin and tire the horde along the route.
2. **The perimeter wall** (integrity bar) is the last barrier at the home zone. Enemies pile up and **attack the wall**; towers/crew shoot them off it. Mira repairs it; you reinforce it in PREP.
3. **The breach — you fight.** When the wall **breaks** (or **leaper** types vault it), enemies flood the home zone toward the Beacon, and **you control your captain to fight them hand-to-hand** (§9). This is where **self-upgrades pay off**: your damage, health, dodge, and abilities decide whether you plug the breach or lose hearts.

So when the line holds you're a **commander**; when it breaks you're a **brawler**. Leaper types guarantee you always have *some* hands-on fighting each round, even when the wall holds.

## 5. The two spend tracks (full purchasables)

**▸ DOCK (defences + terrain)**

| Buy | Effect | Notes |
|---|---|---|
| **Reclaim land** | extends/winds the route (§2) | costs a round to dredge |
| **Tower** (Zapper/Cannon/Net/Coil) | auto-fire on the route; range ring | Tune up: faster → forked → arc |
| **Perimeter wall** | integrity barrier at the home zone | reinforce = more integrity |
| **Trap** | Tar (stamina-drain zone) · Spikes · Spring (knockback) | synergise with rest-spots |
| **Lure / decoy** | pulls enemies onto a longer detour | plays off stamina |
| **Chokepoint gate** | forces single-file at a tile | maximises trap/tower value |
| **Beacon** | power, Pulse, Lens sockets (§8.1.1 base) | the panic button |

**▸ CREW (yourselves)**

| Buy | Effect |
|---|---|
| **Body** | + max health, + stamina |
| **Power** | + melee/ability damage |
| **Speed** | + move + attack speed |
| **Ability** | a special: dash-bash, ground-slam, heal-pulse, shock-nova |
| **Gear** | tool tier (reach, knockback) |
| **Evolve** ★ | milestone transformation (needs **Cores**, §6) |

## 6. Self-upgrade & evolutions

- Each character has a tiny **3-branch tree (Body / Power / Speed)** + an **ability slot** — bought with Credits, clear icons, no spreadsheet.
- **Evolutions** are the RPG payoff: at a milestone, spend **Cores** to transform a character's kit and look (PG-13 glow-up, not body horror):
  - Builder → **Bulwark** — tanky front-liner, plants walls mid-fight.
  - Host → **Conductor** — buffs allies, AoE stun shout.
  - Tactician → **Marksman** — ranged, marks weak points.
  - Charger → **Dynamo** — shock-nova + free Beacon Pulses.
- Evolutions are a **big celebratory unlock**, visible in the room and in co-op — the flex.

## 7. Economy — Credits + rare Cores

- **Credits** (kid word: *coins*) — earned every round (clears, **stamina-collapses**, wall repairs, survival bonus). Spent on *everything* across both tracks.
- **Cores** — rare, dropped by **mini-bosses** (every 5th round) and the occasional exhausted-collapse. **Only Cores unlock evolutions.** This creates the save-vs-spend tension: pour Credits into towers/land now, or chase Cores to evolve. Cores are never real-money (consistent with §11 and the Habbo anti-pattern).

## 8. Enemy roster, escalation & stamina profiles

`count = 4 + round*2`; HP & speed ramp ~per round; new types unlock by round (telegraphed "New: …!").

| Gunk | Unlocks | HP | Stamina | Trait |
|---|---|---|---|---|
| Bottle Skipper | R1 | low | **low** (tires fast) | maze fodder |
| Rust Crab | R3 | high | high | slow, armoured |
| Kelp Crawler | R5 | med | med | **splits** when cleared |
| Fog Wisp | R7 | low | med | hides path preview |
| **Skimmer (leaper)** | R4 | low | n/a | **vaults the wall → straight to the yard** (guarantees breach combat) |
| **Tide Brute (mini-boss)** | every R5 | huge | **never tires** | drops **Cores**; shoves walls |
| Named boss (e.g. Barnacle Leviathan) | milestone (R20) | massive | never | set-piece |

Special rounds for variety: **Fog Tide** (low vis, Floodlight shines), **Rush Tide** (many fast Skippers — attrition payoff), **Pup bonus round** (fast, drops extra Credits).

## 9. Controls — manual captain (the action layer)

- **You directly control your captain.** Desktop: **WASD/arrows** move, the captain **auto-attacks** the nearest enemy in melee reach (space/click for a heavy hit). Mobile: a **drag joystick** (left thumb) to move + auto-attack, a tap button for the ability.
- **Crew** auto-fight + can be positioned; in **co-op each player embodies a fighter** (the embodiment model, now the action core). Downed → revive (§8.2 base).
- The captain matters **every** round via Skimmers, and is decisive at a breach. When nothing's leaking, you're free to reposition/repair — never idle, never overwhelmed.

## 10. "Smart but intuitive" — the design contract

- **Smart = interacting systems:** path length ↔ stamina ↔ tower coverage ↔ wall integrity ↔ your survivability ↔ Credits-vs-Cores. Mastery is *combining* them (a long tar-trapped maze that exhausts Skippers so you can save your fighter for the Brute).
- **Intuitive = every atom is simple:** one ROUND number, two phases, two clearly-labelled spend tabs, a price + one-line effect on everything, two bars on each enemy, a glowing route that always shows the path. No menu dives, no hidden math surfaced.

## 11. Map themes (carried from base)

Harbor Dock (starter) · Night Market (3 gates, stall cover, unlock R5) · Storm Rig (4 gates, spark-puddle hazards, unlock R10). Theme changes layout, hazards, available buildables, palette/audio.

## 12. The shareable hook

A capsule/postcard stamped **"Harbor Dock — survived to Round 14"**, opening into a deterministic replay of *your* run seed so a friend can try to beat it. Local-first leaderboards via signed receipts (Shippie proof, no server). Co-op posts the squad's best round.

## 13. The mockup

`docs/superpowers/specs/docklands-mockups/docklands-td.html` proves the v2 loop: ROUND + PREP/DEFEND, the **two-tab shop** (Dock/Crew) with Credits + Cores, **dig-to-extend the route**, enemies with **HP + stamina** that **slow/rest/collapse**, towers thinning the path, a **perimeter wall with integrity**, **Skimmers + a wall-breach** that drop you into **manual captain combat** (move + auto-attack), and **self-upgrades** that visibly boost your fighter. Self-contained, offline, mobile + desktop; verified zero console errors.

## 14. How this folds into the base spec

- **§6/§7 loop:** replaced by the PREP/DEFEND two-track round loop above.
- **§8.2 Crew:** crew become controllable fighters with skill trees + evolutions + down/revive.
- **§8.3 tower-defence:** becomes maze-defence with dig-path + enemy stamina + the wall-breach → melee layer.
- **§8.1.1 Beacon:** unchanged; power/Pulse pace across rounds; growth gates depth + co-op slots.
- **§8.4/§8.5 RPG + economy:** the two-track Credits/Cores spend is now the spine.
- **10-year-old test (§6.0.1):** still governs onboarding — a two-tap first PREP (buy one tower → Ready), a tiny Round 1, and the first wall-breach scripted as a gentle "now you fight!" moment.

## 15. Endless scaling (high-round design)

Docklands is endless — the **Round number is the score** ("how far did your dock get?"). Tuning (in `docklands-mockups/docklands-td.html`):

- **Count:** `min(40, 4 + floor(round*1.6))` (capped to avoid lag); **spawn interval** shrinks `max(0.4, 1.15 - round*0.015)`.
- **HP:** `× (1 + (round-1)*0.17)`; **speed:** `× min(1.7, 1 + round*0.012)`.
- **Type unlocks (spread across rounds):** Skipper R1 · Rust Crab R3 · Runner R5 · Kelp R7 · Shielded Hulk R9 · Flyer R12 (Flyers ignore walls and beeline — beaten by coverage, not maze).
- **Bosses:** mini-boss (Tide Brute) every 5th round; named boss (Barnacle Leviathan) every 10th — tankier, drops more Cores.
- **Gates open** with progress (1 → 2 at R6 → 3 at R12 → 4 at R18); the flow field converges all gates on the Beacon, so deeper rounds demand more coverage.
- **Economy keeps pace:** round bonus `18 + round*11` grows, funding upgrades/evolves; the player out-scales via tower tiers, captain Power/Evolve, abilities (Slam/Pulse), and the once-per-run Special.
- **Meta:** best round persisted to `localStorage` ("Best run: Round N") for bragging + retry drive.
- Captain **Slam** ability (AoE + knockback, 6s cooldown) joins the Beacon **Pulse** as active tools for the hard rounds.

Endless-survival rule: difficulty out-paces a static setup (a passive 12-tower dock falls ~R7), so high rounds reward active mastery — upgrading, repositioning the captain, timing abilities, and shaping the flow with walls.
