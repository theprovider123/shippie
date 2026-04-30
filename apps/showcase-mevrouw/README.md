# mevrouw-local

Mevrouw, re-architected for Shippie. Two phones, two local stores
(IndexedDB-backed Yjs), no server holding your relationship's data.

## Run

```sh
cd ~/Documents/mevrouw-local
bun install
bun run dev          # http://localhost:4520
```

Open in two browser windows (regular + incognito) on the same
machine. Generate a couple code in window A, type it in window B.
Edits flow live between windows via BroadcastChannel — that's a real
two-device demo running on your laptop today.

## What's in the box

```
src/
├── main.tsx                                # entry
├── app.tsx                                 # pairing → tabbed app shell
├── styles.css                              # Tailwind v4 + Forest & Antique Brass tokens
├── PairingScreen.tsx                       # generate / type couple code
├── router.ts                               # state-based routes
│
├── lib/
│   ├── dates.ts                            # local date helpers
│   ├── schedule.ts                         # mutual-free, nextTogether
│   ├── surprises.ts                        # unlock-mode logic
│   └── cn.ts                               # className merge
│
├── sync/
│   ├── pairing.ts                          # couple code, device id, room id
│   ├── couple-doc.ts                       # Y.Doc + IndexedDB + BroadcastChannel
│   └── useYjs.ts                           # reactive Y.Doc reads
│
├── features/
│   ├── couple/couple-state.ts              # anniversary, names, next visit
│   ├── schedule/schedule-state.ts          # shifts + trips
│   ├── journal/journal-state.ts            # entries + replies
│   ├── todos/todos-state.ts                # things-to-do, watch flag
│   ├── surprises/surprises-state.ts        # text/image/audio + unlock modes
│   ├── memories/memories-state.ts          # photo grid + on-this-day
│   ├── pulses/pulses-state.ts              # ambient thinking-of-you
│   └── gifts/gifts-state.ts                # sealed letters
│
├── components/
│   ├── ScreenHeader.tsx                    # eyebrow + title + lede
│   ├── TabNav.tsx                          # bottom 5-tab nav
│   ├── Countdown.tsx                       # to anniversary or trip
│   ├── PresenceCard.tsx                    # me / partner status today
│   ├── PulseFab.tsx                        # heart FAB → emoji pulses
│   └── ui/button.tsx                       # primary/secondary/ghost
│
└── pages/
    ├── HomePage.tsx                        # countdown + presence + on-this-day
    ├── SchedulePage.tsx                    # 14-day grid + trips + mutual-free
    ├── JournalPage.tsx                     # entries + mood + delete
    ├── SurprisesPage.tsx                   # for-you / from-you + composer
    ├── MorePage.tsx                        # name, anniversary, next visit, unpair
    ├── GiftsPage.tsx                       # sealed letters + composer
    ├── TodosPage.tsx                       # add/check/delete + watch flag
    ├── MemoriesPage.tsx                    # photo grid + favourites
    └── GamesPage.tsx                       # 6-game catalog (stubbed)
```

35 source files, ~3,500 lines. Build: 624ms, 359 KB JS (108 KB gzip), 27 KB CSS.

## Feature parity vs. existing mevrouw

| Existing route | mevrouw-local | Status |
|---|---|---|
| `/home` | `HomePage` | ✓ countdown + presence + on-this-day + gift/surprise CTAs |
| `/schedule` | `SchedulePage` | ✓ 14-day grid, shift toggles, trips, mutual-free scanner |
| `/journal` | `JournalPage` | ✓ entries + mood + delete (replies via the same shape, UI later) |
| `/surprises` | `SurprisesPage` | ✓ text + image, at_time / at_next_visit unlock |
| `/gift`, `/gifts` | `GiftsPage` | ✓ sealed letters, compose, open, anniversary default |
| `/todo` | `TodosPage` | ✓ add, check, delete, watch flag |
| `/memories` | `MemoriesPage` | ✓ photo grid + favourites |
| `/games` | `GamesPage` | ⏳ stubbed catalog (6 games) |
| `/glimpses` | — | ⏳ folded into Memories for now |
| `/more` | `MorePage` | ✓ name, anniversary, next visit, unpair, navigation |
| Pulse FAB (every page) | `PulseFab` | ✓ heart button + 6 emoji quick-picks |

## Look & feel

Verbatim port of mevrouw's design tokens:

- **Background**: `oklch(0.13 0.035 150)` — deep forest
- **Foreground**: `oklch(0.93 0.012 80)` — warm cream
- **Primary / gold**: `oklch(0.72 0.15 70)` — antique brass
- **Cards**: `oklch(0.18 0.045 150)` — slightly lifted forest
- **Radius**: 1rem base
- **Type**: Fraunces serif headlines, system sans body, JetBrains Mono labels
- Dark mode only (matches the original)

Captured at 414×896 (iPhone 13 Pro) — see `screenshots/01-pair-choose.png` through `screenshots/11-games.png`.

## Architecture beats

**One Y.Doc per couple.** Every feature is a namespace inside it
(`gifts`, `journal_entries`, `todos`, `surprises`, `memories`,
`shifts`, `trips`, `meta`, `pulses`). Yjs handles concurrent edits
from two devices without losing data — last-writer-wins where it
matters, CRDT merging where it's collaborative.

**IndexedDB persistence.** `y-indexeddb` mirrors the doc to the
browser's IndexedDB, so reload-and-offline-work both Just Work.

**BroadcastChannel cross-tab sync.** Two browser tabs on the same
machine see each other's edits live, no infrastructure. This is the
free demo of two-device sync today.

**Production transport** (next chunk of work, ~1 hour): swap
BroadcastChannel for Shippie's `SignalRoom` Durable Object via
`@shippie/proximity` `createGroup`. The Y.Doc shape doesn't change.

## What's next

- **Real cross-device transport.** `y-webrtc` + Shippie SignalRoom DO. ~50 lines, copy from `apps/showcase-live-room`.
- **Photos via OPFS.** Swap data URLs for OPFS Blob storage so memories scale.
- **Games port.** 6 games on the same Yjs pattern, one per session.
- **End-to-end encryption.** Derive AES-GCM key from couple code; wrap Yjs updates before transport.
- **Pairing crypto upgrade.** Replace djb2 `roomIdFor` hash with `SubtleCrypto` digest.
- **Real cryptographic SAS verification** on pairing (anti-MITM phrase).

## What's gone (intentionally)

- Supabase + Postgres — replaced by Yjs + IndexedDB
- Next.js — replaced by Vite + React
- Server actions — replaced by direct Y.Doc mutations
- `couple_id` columns — the whole doc is couple-scoped
- Auth — couple code is the shared secret
