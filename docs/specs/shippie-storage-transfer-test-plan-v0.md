# Shippie Storage Transfer Test Plan v0

Goal: make Shippie sealed storage feel as easy as login and faster than the
user expects. The mechanism must be measurable, recoverable, and shared by
every app that stores private data.

## What We Test

- Local encrypt/sign/reduce latency.
- Sealed event push latency.
- Sealed snapshot push/pull latency.
- Safe manifest lookup for fast restore.
- Sealed change-hint fresh/stale paths before full event pulls.
- Sealed change stream: one leader tab waits on metadata-only updates, then
  pulls encrypted data only when a hint changes.
- Multi-tab leadership: one tab syncs, followers delegate and refresh.
- Restore-device pull and deterministic reducer replay.
- Encrypted chunked attachment upload/download for image-sized payloads.
- Wrapped access-bundle relay for "Add another device" and "Move to new phone".
- Raw-key leak invariant on every outgoing request.
- Outbox survival when the network or budget fails.
- App data policy inheritance before deploy.

## Commands

```bash
bun run --cwd apps/platform check:sealed-cloud
bun run --cwd apps/platform bench:sealed-cloud -- --origin https://shippie.app --profile quick
bun run --cwd apps/platform bench:sealed-cloud -- --origin https://shippie.app --profile room
bun run --cwd apps/platform bench:sealed-cloud -- --origin https://shippie.app --profile move-phone
bun run --cwd apps/platform bench:sealed-cloud -- --origin https://shippie.app --profile media
bun run --cwd apps/platform torture:sealed-cloud -- --origin https://shippie.app --media 1048576,5242880
```

Profiles:

- `quick`: production smoke with two documents, small attachments, and two
  access handovers.
- `room`: Match Room shaped load with several room documents and a realistic
  burst of events.
- `move-phone`: the "I got a new phone" path, measured as one complete user
  moment.
- `media`: photo-sized sealed attachments, including 1 MB, 5 MB, and 12 MB
  payloads.
- `stress`: high-concurrency abuse/edge profile for manual pre-release runs.

The benchmark emits p50/p95/max timings and verifies:

- raw document keys never appear in outgoing request bodies
- restored devices rebuild the same event count
- attachment byte counts survive round trip
- sealed snapshots sync and remain opaque
- stale devices see hint changes before pulling full pages
- leader tabs receive metadata-only stream wakeups before the next poll
- encrypted chunked attachments restore to the same byte count
- wrapped handover bundles decrypt only on the receiver
- product targets for local append, handover, batch sync, restore, and 1 MB
  media upload

## Performance Targets

These are product targets, not protocol guarantees:

- Local append should feel instant: p95 under 30 ms on a normal phone.
- Handover relay should feel like login: p95 under 1.5 s on good 4G/WiFi.
- Small sealed event batch sync should stay under 1 s p95 from the UK to
  production.
- Snapshot sync should stay under 1 s p95 from the UK to production.
- Restore of 100 small events should complete under 2 s on good 4G/WiFi.
- A 1 MB encrypted chunked image attachment should upload under 3 s on good WiFi.

## App Intertwining

Every app gets this through **Your Data**, not a custom sync screen. Apps should
intertwine by sharing capability-shaped Documents rather than sharing raw
database tables:

- Journal can export a sealed "reflection" document to Therapy Notes.
- Receipt Snap can send sealed expense records to Ledger.
- Recipe can send pantry items to Shopping List and Meal Planner.
- Lift, Body Metrics, and Symptom Diary can contribute sealed health snapshots
  to a private timeline the user owns.
- Match Room can pass sealed league history into Tournament Fantasy seasons.

The user-facing copy stays simple: "Move to new phone", "Add another device",
"Saved privately". The engineering layer uses Documents, wrapped access bundles,
and sealed attachments.

## Next Test Layers

- Browser automation: open two real app frames and complete a QR-style handover.
- Mobile Safari soak: leave the app idle, delete browser storage, restore from
  a peer/sealed copy.
- Budget chaos: force 429 responses and prove local outbox retries without data
  loss.
- Cross-app grants: prove one app can receive an allowed sealed payload while a
  non-granted app receives nothing.
- Large media: test progressive sealed attachment upload for photos and audio.
- Regression gate: run `quick` on every deploy, `room` + `move-phone` before
  Match Room/Fantasy releases, and `media` before any app advertises photo,
  audio, or PDF storage.
