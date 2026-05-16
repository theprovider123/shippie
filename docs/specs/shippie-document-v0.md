# Shippie Document v0

Draft: 2026-05-11

Shippie Document is the durable private-data primitive inherited by Shippie apps. A document is a signed, encrypted, append-only event log plus a deterministic reducer supplied by the app.

The user promise is:

> Saved here. Recoverable later. Private throughout.

Shippie can store sealed copies of document events and snapshots. Shippie cannot open them because raw document keys never leave the user's devices.

## Scope

Document v0 is intentionally small:

- local-first event logs for Shippie apps
- sealed sync through Shippie-hosted or self-hosted Hubs
- recovery through invite links, recovery cards, and device handover
- deterministic app reducers over verified events

Document v0 is not:

- a public peer network
- a token or storage marketplace
- a generic decentralized storage protocol
- a replacement for app-specific moderation or legal requirements
- a file-storage free-for-all; heavy media uses sealed attachments with separate safety rails

## Terminology

- **Document**: one private app data space, such as a fantasy league, trip, journal, recipe book, or room.
- **Document key**: a 256-bit symmetric key used to encrypt the document's events and snapshots.
- **Device key**: a signing keypair held by a user's device. It signs document events before encryption.
- **Sealed copy**: ciphertext stored by a Hub. It can be moved and recovered, but not read without the document key.
- **Hub**: a storage/relay endpoint. Hubs store encrypted bytes and metadata only.
- **Reducer**: app code that turns verified events into current state.
- **Attachment**: a larger encrypted blob, such as an image, audio file, PDF, or video snippet. Attachments are referenced by events but stored separately.

## Data Model

Conceptually:

```txt
Document = {
  id,
  key,
  encryptedEvents[],
  encryptedSnapshots[],
  reduce(events) -> state
}
```

The app sees decrypted, verified events. Hubs see only encrypted envelopes:

```txt
EncryptedDocumentEvent = {
  schema,
  documentId,
  eventId,
  authorDeviceId,
  authorPublicKey,
  createdAt,
  parentIds,
  cipher,
  signatureAlg,
  nonce,
  ciphertext
}
```

The encrypted plaintext contains the actual event kind and payload:

```txt
SignedDocumentEvent = {
  event: {
    schema,
    documentId,
    eventId,
    parentIds,
    authorDeviceId,
    createdAt,
    kind,
    payload
  },
  authorPublicKey,
  signature
}
```

The encrypted plaintext must mirror the envelope metadata. Clients reject envelopes whose decrypted event does not match `documentId`, `eventId`, `authorDeviceId`, `authorPublicKey`, `createdAt`, or `parentIds`.

## Storage Classes

Document data is not one undifferentiated bucket. v0 splits sealed data into three classes so cost, performance, and abuse controls match real usage.

| Class | Use | Default guard | Notes |
| --- | --- | --- | --- |
| Events | Small app mutations: draft pick, note edit, vote, trip item | 256 KB max event, 20k events/day/document, 100 MB/day/document | Events should never carry raw images/files. |
| Attachments | Encrypted media/files referenced by events | 25 MB max attachment, 1 GB/day/document | Apps should use SDK encrypted/chunked helpers so raw media bytes never cross the boundary. |
| Snapshots | Encrypted reducer checkpoints | 2 MB max snapshot in v0.5 | Used to avoid replaying long histories. |
| Manifests | Safe metadata: counts, latest cursors, latest snapshot id | metadata only | Lets clients restore quickly without listing everything first. |

The user-facing experience can remain free and generous. These guards are payer-safety brakes against abnormal usage, not plan limits users should have to think about.

Events may reference attachments:

```txt
event.payload = {
  kind: "photo-added",
  attachmentId: "att_...",
  mime: "image/jpeg",
  width: 1600,
  height: 1200
}
```

The attachment bytes are encrypted on-device and uploaded through the sealed attachment path. The server sees object size, timing, and metadata needed to store the sealed copy; it does not see the decrypted file.

## Cryptography

Document v0 uses Web Crypto-compatible primitives:

- document encryption: **AES-256-GCM**
- nonce: **96-bit random nonce per encrypted event**
- event signing: **ECDSA P-256 with SHA-256**
- canonical event encoding: stable JSON with lexicographically sorted object keys
- document key format: 32 random bytes encoded as base64url
- device public key format: SPKI encoded as base64url

Reasons:

- These primitives are available in modern Safari, Chrome, Firefox, Cloudflare Workers, and Bun.
- They avoid adding native or WASM crypto dependencies to app bundles for v0.
- They let Shippie publish a small reference reader/decrypter for exports.

Future versions may add XChaCha20-Poly1305 or HPKE-style envelopes where runtime support and bundle size make sense. v0 optimizes for portable browser compatibility.

## Hard Invariants

These are engineering requirements, not preferences:

- Raw document keys never leave the user's device.
- Shippie only receives ciphertext or wrapped access bundles.
- Hubs can store and relay, but cannot decrypt.
- Browser storage is a working cache, not the only durable copy.
- Event signatures are verified after decrypt and before reduce.
- Reducers ignore or reject invalid, late, duplicate, or unauthorized events.
- Migration never deletes legacy local data until rebuilt Document state is verified.
- Events stay small. Images, audio, PDFs, and other heavy files use sealed attachments.
- Sync is background work. Rendering from local cache must not wait on the Hub.
- Quotas and abuse controls must be configurable without changing product copy.

## What Shippie Can And Cannot See

Shippie can see operational metadata for sealed sync:

- that an encrypted document namespace exists
- encrypted blob sizes
- request timing
- IP and request metadata
- approximate sync frequency
- quota and health metadata

Shippie cannot see document contents:

- notes
- recipes
- league picks
- messages
- local files inside encrypted snapshots
- recovery keys
- raw document keys

User-facing copy should be concise:

> Shippie stores sealed copies. We can help recover them, but we can't open them.

## Recovery And Device Handover

Normal cross-device movement is not "export private key" in the UI. It is:

- Add another device
- Move to new phone
- Show recovery card
- Restore data

Device handover uses a wrapped access bundle:

```txt
new device creates temporary public key
old device encrypts access bundle to that public key
Shippie may relay the wrapped bundle
new device unwraps locally
new device pulls sealed events from replicas
```

The access bundle may contain document IDs, document keys, replica pointers, device/member profile data, and latest cursors. It must not be readable by Shippie.

Document v0 uses an ECDH P-256 + AES-256-GCM wrapped access bundle for this handover primitive:

```txt
WrappedAccessBundle = {
  schema: "shippie.document.wrapped-access-bundle.v1",
  alg: "ECDH-P256-AES-256-GCM",
  senderPublicKey,
  nonce,
  ciphertext
}
```

The ciphertext contains the access bundle. The relay should not see document IDs or document keys inside this handover payload.

The platform relay is short-lived:

```txt
PUT /api/documents/transfer/:transferId
GET /api/documents/transfer/:transferId
```

It stores only `WrappedAccessBundle` JSON with a short TTL. The relay rejects plaintext fields such as `documentId` or `documentKey`.

## Performance Plan

Documents should make apps more resilient without making them feel heavier.

Normal open path:

```txt
open app
read local cache/snapshot
render immediately
sync sealed events in background
apply new events when available
```

Normal write path:

```txt
user action
append locally
update UI immediately
encrypt/sign in a small task
queue upload
sync when online/idle
```

Scale requirements:

- Do not block app startup on Cloudflare, peer discovery, or decryption of a full history.
- Do not replay every event forever; snapshot and compact.
- Do not R2-list on every app resume at scale; use cursors/manifests.
- Do not upload each high-frequency UI gesture as a durable event; batch or coalesce.
- Move heavy compaction/encryption work to a Web Worker where needed.
- Sync should back off when idle, offline, battery-constrained, or repeatedly failing.

## Cost And Abuse Plan

Shippie should feel free and unlimited for normal users, while protecting the payer from accidental or malicious cost explosions.

Default guardrails:

- event payload max: 256 KB
- document event budget: 20,000 events/day
- document event bytes budget: 100 MB/day
- IP event budget: 50,000 events/day
- attachment max: 25 MB
- document attachment bytes budget: 1 GB/day

These values are environment-configurable. They are deliberately high for normal small-app usage and low enough to stop a script from turning sealed sync into unbounded object storage.

Required follow-ups before broad rollout:

- per-user or recovery-vault budget once user/device namespaces exist
- per-app maker budget for uploaded apps
- dashboard alerts for abnormal write/read growth
- automatic event chunking before significant scale
- snapshot compaction and old-event retention policy
- separate treatment for truly large media/video apps
- abuse logs that capture metadata only, never plaintext

## Edge Cases To Design For

### Browser And Device Loss

- Safari/browser storage can disappear. Local storage is cache, not the only durable copy.
- A fresh device must restore from recovery card, invite, old-device handover, or a member re-invite.
- If every replica is gone, data is gone.
- If every key/recovery path is gone, sealed copies are unreadable.

### Migration

- Existing app data must remain readable during migration.
- Legacy local data is copied into Document events, rebuilt, compared, then switched over.
- Migration must resume after tab close, crash, low battery, or offline usage.
- Corrupt legacy data should keep the app in legacy mode with a recoverable warning.
- Multi-device legacy conflicts need app-specific merge rules.

### Shared Documents

- "Add my device" and "Invite another person" are separate flows.
- Joining one shared document must not reveal other documents in the same app.
- Revocation can stop future access through key rotation, but cannot erase old data already synced to a removed member.
- Commissioner/admin actions must be signed and reducer-enforced.

### Media And Large Files

- Events never carry raw files.
- Attachments are encrypted on-device and referenced by event ID.
- Attachments need separate quotas, retry logic, progress UI, and resumable upload in later versions.
- Thumbnail/preview generation happens client-side when possible.
- Large media-heavy apps may need a paid maker/user policy even if normal app data remains free.

### Sync Conflicts

- Duplicate events are idempotent.
- Same logical record edited on two devices must follow app-specific rules: preserve both, last-writer-wins, CRDT, or review queue.
- Late events must be reducer-rejected where timing matters, such as locked lineups or score predictions.
- Clients should tolerate receiving events out of order.

### Security And Trust

- Server validators reject unexpected plaintext fields beside ciphertext.
- Raw keys must never appear in URLs except fragment-only invite/recovery material that is not sent to the server.
- Logs must not include request bodies for sealed endpoints.
- Public docs must name cryptographic primitives and metadata Shippie can see.
- A reference reader/decrypter is required before the trust claim is marketed heavily.

### Operational Failure

- R2/KV unavailable: app keeps local writes queued and warns softly in Your Data.
- Hub returns 429: app backs off and keeps local state; user should not lose work.
- Clock skew: reducers should prefer deterministic event ordering and signed lock rules over trusting client time alone.
- Partial attachment upload: do not emit the referencing event until the sealed attachment is confirmed, or mark it pending.
- Shippie shutdown: users with exports/recovery keys can use the public spec/reference reader.

## V0 Ship Boundary

V0 should prove the platform with one app family, not migrate every app at once:

1. `@shippie/doc` SDK.
2. Sealed event and attachment endpoints.
3. Your Data refactor for Private Sync, Safe Copies, Recovery, Add Device, and Move Phone.
4. Recovery card design and flow.
5. Cross-device handover with wrapped access bundles.
6. Match Room migration onto Documents.
7. Tournament Fantasy on top of Documents.
8. Real-device Safari/iOS/Android restore testing.

Post-v0:

- migrate other first-party apps app-by-app
- add self-hosted Hub as opt-in extra replica
- expose maker manifest/SDK docs
- marketplace private-sync badges
- event chunking/compaction for higher scale

## App Integration

Apps should use reducers:

```ts
const doc = await openDocument({
  documentId,
  documentKey,
  signing,
  initialState,
  reducer,
  store,
  sync,
  realtime: true,
});

await doc.append({
  kind: "draft-pick",
  payload: { playerId: "ENG-09", pick: 14 },
});

const state = doc.state();
await doc.createSnapshot();
await doc.sync();
```

`append()` writes locally first and updates reducer state immediately. `createSnapshot()` encrypts a compact reducer checkpoint so future restores start from a sealed checkpoint and replay only the tail. With `realtime` enabled, the SDK schedules an aggressive coalesced push, keeps a visible-tab pull loop running, slows down while hidden, and backs off after offline/quota errors. `sync()` remains available for explicit pulls. If the Hub is offline or returns a payer-safety `429`, local state remains intact and pending events stay queued.

The v0 SDK includes:

- memory store for tests and temporary rooms
- localStorage store for small encrypted caches and reload persistence
- IndexedDB store for larger encrypted caches and browser quota resilience
- a storage interface that can be backed by OPFS for heavier app data
- sealed sync client for event, snapshot, manifest, and attachment endpoints
- realtime autosync scheduler with app-visible status
- encrypted/chunked attachment helpers for file/image apps

The local store persists encrypted envelopes and outbox metadata only. It must not persist decrypted app payloads unless an app deliberately maintains its own local plaintext cache for UX, in which case Your Data must still treat the sealed Document as the recoverable source.

The same primitive should be inherited by first-party and uploaded apps through SDK/runtime APIs, with the standard Your Data panel providing recovery, safe-copy status, and device handover.

## Shutdown Portability

Shippie should publish this spec, keep the encrypted export format stable, and provide a reference reader so users can decrypt their own exports if they have the recovery key. The trust promise is strongest when users are not dependent on Shippie code staying online forever.
