# Steep — medicinal tea blend showcase (design)

**Date:** 2026-05-09
**Status:** Approved through brainstorming dialogue, ready for plan.
**Showcase path (proposed):** `apps/showcase-steep/`

## Why

Shippie's showcase slate covers cooking (Recipe Saver), trip-time (Crewtrip),
splitting (Tab), capture (Receipt Snap, Voice Memo), creative work
(Whiteboard, Story Studio), and a handful of session tools. Nothing yet
covers the specific texture of *blending* — assembling small numbers of
ingredients in ratios, then preparing them through a focused ritual
(brewing). Loose-leaf herbal tea is a clean wedge: small data, real
craft, daily use.

The app also exercises a few primitives the platform should be good at:
intent-based filtering, inventory tracking, share-via-QR for handoffs,
and the iOS-aware data-safety layer that just shipped in Recipe Saver.
Steep becomes a second adopter of the durability primitives, which is
the natural pull for promoting them into a shared package later.

## Premise

A local-first PWA for designing, saving, and brewing loose-leaf
medicinal blends. Recipe Saver pattern with herbal-specific surfaces.
Forest + amber visual identity. Disclaimer up front: a notebook, not a
doctor.

## Audience

Designed for the personal triangle:

- **Home blender / hobbyist** — designing and re-brewing personal blends.
- **Self-managing wellness user** — intent-driven ("I need a sleep tea").
- **Tea-curious learner** — wants to understand herbs before blending.

A practicing herbalist could use it but is not the optimization target —
their needs (multi-recipient, contraindications, dosing tracking) pull
the UX toward a clinical CRM, which is a different product.

## Core decisions

| Decision | Choice |
|---|---|
| Library | Curated starter (~40 herbs + ~8 starter blends) |
| Home loop | Blends-first (Recipe Saver pattern) |
| Quantities | Parts, scaled at brew time |
| Brewing | Focused Brew Mode (CookingMode pattern) |
| Intent tags | Yes — sleep / calm / focus / digestion / energy |
| Inventory tracking | Yes (per-herb grams, low warnings) |
| Sharing | QR / URL via `@shippie/share` + `@shippie/qr` |
| Brew journal | Yes (one-line note per brew, auto-logged) |
| Visual | Forest greens + amber + cream paper |
| Storage | OPFS + wa-sqlite via `@shippie/local-db` |
| Sync | None in v1 (local only) |

## Architecture

New showcase at `apps/showcase-steep/`. Vite + React. Mirrors
`apps/showcase-recipe/` structure — same package boundaries, same
build/test config, same SDK wrapper integration.

### Reuse from this repo (don't reinvent)

- `apps/showcase-recipe/src/db/data-safety.ts` — copy file shape for v1;
  iOS-aware `iosRiskLevel`, four-tier `StorageStatus`, install-nudge,
  persistence-grant retry. Same primitives, renamed for `steep`.
- `apps/showcase-recipe/src/db/backup.ts` — copy the encrypted export +
  share-sheet save flow.
- `apps/showcase-recipe/src/components/RecipeDataPanel.tsx` →
  `SteepDataPanel.tsx` — same layout, same iOS warning, same status tile.
- `apps/showcase-recipe/src/share/recipe-import.ts` →
  `blend-import.ts` — same `@shippie/share` + `@shippie/qr` pattern.
- `apps/showcase-recipe/src/pages/CookingMode.tsx` → `BrewMode.tsx` —
  same full-screen wake-lock pattern, plus a steep-timer countdown.
- `@shippie/local-db` — OPFS + wa-sqlite via `MemoryLocalDb`/OPFS adapter.
- `@shippie/sdk/wrapper` — `detectInstallMethod`, `detectStandalone`,
  `createLocalNavigation`, `haptic`.
- `@shippie/design-tokens` — base typography (Fraunces) + token family;
  Steep adds a forest/amber palette overlay.

The duplication of data-safety code into a second showcase is
deliberate. The plan is: ship Steep, prove the abstraction holds, then
promote the shared primitives into `@shippie/durability`.

## Data model

```ts
// herbs — the seed library + user additions
interface Herb {
  id: string;
  slug: string;                    // 'chamomile', 'rose-petals'
  common_name: string;
  latin_name: string;
  tastes: TasteTag[];              // 'sweet'|'bitter'|'pungent'|'sour'|'salty'|'astringent'
  actions: ActionTag[];            // 'calming'|'warming'|'cooling'|'uplifting'|...
  energetics?: string;             // free-text tradition note
  traditional_uses?: string;       // prose, not claims
  default_brew_temp_c?: number;
  default_steep_minutes?: number;
  max_resteeps?: number;
  notes?: string;
  source: 'seed' | 'user';
  created_at?: string;
  updated_at?: string;
}

// blends — what users design and brew
interface Blend {
  id: string;
  name: string;
  notes?: string;
  intent_tags: IntentTag[];        // 'sleep'|'calm'|'focus'|'digestion'|'energy'|...
  default_temp_c?: number;
  default_steep_minutes?: number;
  max_resteeps?: number;
  default_batch?: 'cup' | 'pot' | 'tin';
  created_at?: string;
  updated_at?: string;
}

// blend_ingredients — many-to-one to blends, one-to-one to herbs
interface BlendIngredient {
  id: string;
  blend_id: string;
  herb_id: string;
  parts: number;                   // 1, 2, 3 — relative ratio
  notes?: string;
}

// inventory — what the user has on hand
interface InventoryRow {
  id: string;
  herb_id: string;
  grams_on_hand: number;
  low_threshold_g: number;
  last_restocked_at?: string;
}

// brew_log — append-only history
interface BrewLogEntry {
  id: string;
  blend_id: string;
  brewed_at: string;
  batch_label?: string;            // 'cup' | 'pot' | 'tin' or user free text
  note?: string;                   // optional one-liner
}
```

Curated seed: ship ~40 herbs (chamomile, lavender, lemon balm, peppermint,
rose petals, ginger, holy basil/tulsi, valerian, passionflower, oat
straw, nettle, calendula, etc.) and ~8 starter blends keyed to the
intent tags. Disclaimer attached at the herb-property level — every
"traditional use" is framed as cultural/historical, not therapeutic.

## Surfaces

1. **Home (Blends)** — search bar, intent-tag filter chips, a small
   "Try a starter blend" shelf, your saved blends. Tap → blend detail.
2. **Blend detail** — herbs as parts, default brew config, intent tags,
   share/QR. Buttons: Brew it · Edit · Share.
3. **Blend builder** — pick herbs from library (search + filter by taste
   or action), drag-to-reorder, set parts, set intent tags, set default
   brew config.
4. **Library (Herbs)** — browse curated + user-added with filters
   (taste, action). Tap a herb for detail (properties, traditional uses,
   brewing baseline, "add to current blend").
5. **Brew Mode** — full-screen. Pick batch size at entry, scaled grams
   render, water temp + steep timer with countdown + re-steep prompt for
   herbs that give multiple infusions. Post-brew: optional one-line note
   saved to brew_log.
6. **Inventory** — list of herbs you stock, grams + low-threshold per
   herb, restock list ("3 low"). Brew Mode warns inline if a blend's
   herbs are low.
7. **Brew journal** — chronological feed of brew_log entries; per-blend
   "you've brewed this 14 times" surfaces on blend detail.
8. **Your Data** — copy of the recipe-saver panel: iOS eviction warning,
   four-tier status tile, persistence-grant, encrypted backup/restore,
   share-sheet save on iOS.

## Visual + copy

- **Palette.** Forest (deep green) for primary, amber for accent, cream
  paper for surface, ink-brown for text. Same `--cream-bg/--cream-text/
  --cream-secondary` token family Recipe Saver uses, repurposed.
- **Type.** Fraunces for headlines (continuity with Crewtrip + design
  tokens), Inter for body, mono only for codes/grams/timers.
- **Tone.** Plain, grounded, not mystical. No "ancient wisdom" copy.
  Properties stated as cultural/traditional usage, not medical claims.
- **Disclaimer.** Persistent footer link + a one-time sheet on first
  launch:

  > Steep is a notebook, not a doctor. Properties shown are traditional
  > uses, not medical advice. If you take medication or have a health
  > condition, talk to a herbalist or doctor.

## Phasing

| Track | Scope | Estimate |
|---|---|---|
| 1 | Scaffold + data model + seed + data-safety + Your Data + disclaimer | 1 week |
| 2 | Home + blend detail + blend builder + library + Brew Mode | 1.5 weeks |
| 3 | Inventory + brew journal + intent shelf + sharing | 1 week |
| 4 | Forest + amber palette wiring + copy pass + real-phone smoke | 3 days |

Total: ~4 weeks for one engineer.

## Verification (per track)

- Per-track green-light: `bun run --filter @shippie/showcase-steep typecheck && build && test`
- Recovery drill (Track 1): wipe → restore round-trip test in CI, mirroring `apps/showcase-recipe/src/db/backup.recovery.test.ts`.
- Manual smoke (Track 4): iOS Safari (uninstalled + Home Screen) + Chrome desktop + Android Chrome. Walk: build a blend → brew it → share via QR → open share on second device → restore backup.

## Out of scope (v1)

- Multi-device sync.
- Practicing-herbalist features (multi-recipient blends, contraindication checks, dosing tracking).
- Drug-interaction warnings.
- AI-suggested blends from natural-language intent.
- Marketplace listing of blends.

## Open question deferred to v2

When journal also adopts the data-safety primitives, promote the shared
code from `apps/showcase-{recipe,steep}/src/db/data-safety.ts` into
`@shippie/durability`. That's the second-adopter test and the right
moment for the abstraction. Tracked in the recipe storage v2 plan.
