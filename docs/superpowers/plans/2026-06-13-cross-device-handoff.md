# Cross-device handoff — phone ⇄ laptop in ≤3 clicks

_Plan, 2026-06-13. Grounded in an audit of existing primitives — this reuses what's
already built rather than inventing a sync stack._

## The two needs (don't conflate them)

A user "moving from phone to laptop" actually wants two separable things:

1. **"My tools are here."** The dock — which apps I've saved/pinned — should appear on
   any device I sign in to. Today the dock is `localStorage`-only (`launcher-memory.ts`,
   key `shippie:launcher:v1`), so a fresh laptop is empty even though the account is the
   same. This is the 95% case and the cheapest to fix.
2. **"Continue where I left off."** The *open app's state* (its local-db rows + files) on
   the laptop. This is the harder, rarer, privacy-sensitive case.

Treating these as one feature is the trap. Ship them as two layers.

## What already exists (so we don't rebuild it)

| Primitive | File | What it gives us |
|---|---|---|
| Account identity crosses devices | `lib/server/auth/lucia.ts` | Same `userId` on phone + laptop after sign-in. The handoff doesn't need to move identity, only state. |
| Sealed access relay (ECDH + AES-256-GCM, KV, 10-min TTL) | `lib/server/documents/access-transfer.ts` | A built, encrypted, ephemeral device→device handoff channel. UI strings for "Move to new phone" / "Add another device" already exist in `dock/+page.svelte:2410`. |
| WebRTC full-state transfer (rows paged + files chunked, QR-keyed, 5-min TTL) | `packages/proximity/src/transfer.ts` | Direct P2P transfer of an entire app snapshot. No server touch. Built, not surfaced. |
| QR generate + share sheet | `packages/qr`, `showcase-kit-v2/qr-sheet` | Brand QR + scan/copy/native-share UI. |
| Sealed-doc change stream (encrypted events/snapshots in R2, pollable) | `lib/server/documents/sealed-cloud.ts` | An encrypted multi-device sync channel with budgets. Heavier; for live continuous sync, not one-shot handoff. |
| Encrypted backup export/restore (`.shippiebak`) | `packages/backup-providers`, `packages/local-db/backup.ts` | The manual fallback that already works (≈5 clicks + out-of-band file move). |

The dock is the only thing with **no** cross-device story at all. Everything else has a
primitive waiting for a UX.

## Layer 1 — Account dock sync (the baseline, ship first)

Make the saved-tools dock follow the account. After sign-in on the laptop, your tools are
just there — **0 extra clicks** beyond the sign-in you'd do anyway.

- New D1 table `user_dock(user_id, app_slug, position, saved_at)` (+ migration).
- `saveAppToDock` / `removeAppFromDock` in `launcher-memory.ts` also POST to
  `/api/dock` (fire-and-forget, optimistic local write stays instant + offline-safe).
- Dock load (`dock/+page.server.ts`) reads the account's saved slugs and seeds
  launcher-memory; local recents/launch-counts stay per-device (they're device-personal).
- Conflict rule: union on read, last-write-wins per slug on write. A removed slug tombstones
  for 30 days so a stale offline device can't resurrect it.
- Privacy: dock rows are just app slugs the account already "owns" server-side — no new
  exposure. Offline copies / capsules remain explicitly per-device (the existing copy
  "Dock saves and offline copies stay per device" tightens to "Saved tools follow your
  account; offline copies stay per device").

**Clicks to "my tools on laptop": 0 beyond sign-in.** ~1 migration + ~2 small endpoints +
hydrate. Low risk, no encryption needed.

## Layer 2 — One-tap continuity (the magic moment)

"Continue this app from my phone" with actual state. Reuse `access-transfer.ts`'s
ECDH+KV relay verbatim — it already does encrypted, ephemeral, account-scoped device→device.

Flow (target ≤2 clicks):
1. Laptop, signed in, opens (or is offered) App X with no local data → shows a quiet
   "Continue from your phone?" affordance + a short 6-char code / QR.
2. Phone (same account) gets the pending-handoff signal (poll or push) → one tap
   "Send to laptop" → encrypts App X's snapshot (reuse `transfer.ts` framing: manifest +
   paged rows + chunked files), posts the ciphertext to the relay keyed by the code.
3. Laptop pulls, decrypts with the ECDH-derived key, restores into local-db, opens the app.

**Privacy posture is the one real decision** (see below) — does the encrypted snapshot
transit Cloudflare KV/R2, or go direct P2P?

## The decision: continuity transport

| | A. Encrypted relay (reuse access-transfer) | B. Direct WebRTC (reuse proximity/transfer) | C. Hybrid (try P2P, fall back to relay) |
|---|---|---|---|
| Clicks | ~2 | ~3 (scan QR) | ~2–3 |
| Works across networks / cellular | ✅ | ⚠️ same LAN or STUN punch-through | ✅ |
| App data touches server | ✅ but E2E-encrypted + 5-min TTL | ❌ never | ❌ when P2P succeeds; ✅ encrypted on fallback |
| Build cost | low (relay built) | low (transfer built) | medium |
| Best when | "it just works anywhere" matters most | strict local-first / zero-server-trust | want both |

Recommendation: **Layer 1 now (clear win, no posture question), then Layer 2 as Hybrid (C)**
defaulting to P2P and falling back to the encrypted relay — most private when possible,
still works on cellular. But A vs B vs C is the user's call because it sets the local-first
trust story.

## Out of scope (deliberately)

- Continuous live sync (two devices editing simultaneously) — that's the sealed-doc change
  stream, a much bigger feature. Handoff is one-shot "pick up over there."
- Moving offline capsules / model caches — the laptop re-downloads; not worth syncing.

## Sequencing

1. **Layer 1 dock sync** — ✅ SHIPPED 2026-06-13 (worker `1a5f6456`, migration 0067, commit
   `82a387d7`). D1 `user_dock` + `/api/dock` + `mergeAccountDock` on hydrate. Saved tools
   follow the account; recents/launch-counts/offline copies stay per-device.
2. **Layer 2 continuity — chosen transport: Hybrid (try P2P, fall back to encrypted relay).**
   Next build. Reuse `proximity/transfer.ts` for the P2P snapshot and `access-transfer.ts`
   (ECDH + KV, 5-min TTL) for the relay fallback. UX target ≤2 clicks: laptop shows
   "Continue from your phone" (code/QR); phone taps "Send"; laptop restores into local-db.
   Known v1 edge to handle: an offline re-save that hasn't synced yet can be subtracted by a
   server tombstone on next load (rare; user re-saves).
3. Tighten the per-device vs account-synced copy in `/you` and the dock sync note
   ("Saved tools follow your account; offline copies stay per device").
