# Shippie Document Threat Model v0

## Promise

Shippie can store sealed copies of app data and help devices find fresher
copies. Shippie must not be able to open the private app payloads.

## Cryptographic Boundary

- Document payloads are encrypted on the user device with AES-256-GCM.
- Events and snapshots are signed with ECDSA-P256-SHA256 before encryption.
- Device handover uses ECDH-P256 plus AES-256-GCM wrapped access bundles.
- Raw document keys are never uploaded to Shippie endpoints.
- Attachments and media use encrypted/chunked helpers; raw media bytes must not
  cross the Shippie boundary.

## What Shippie Can See

- Document ids.
- Event ids, parent ids, author device ids, author public keys, and created-at
  timestamps.
- Snapshot ids, event counts, and snapshot created-at timestamps.
- Attachment ids, byte sizes, content-type metadata, and request timing.
- IP/device budget counters used to protect the payer from abuse.
- Change hints: latest sealed cursors and updated-at timestamps.

## What Shippie Cannot See

- Event kinds and payloads.
- Reducer state inside sealed snapshots.
- Recovery-card private contents.
- Attachment/media plaintext.
- The user's raw document key unless the user deliberately discloses it outside
  the Shippie flow.

## Abuse And Cost Controls

- Per-document, per-IP, and per-device write budgets.
- Per-document and per-device attachment byte budgets.
- Maximum event, snapshot, batch, and attachment sizes.
- Chunked media manifests with per-chunk and whole-file hashes after decrypt.
- Client outboxes remain local when the hub returns `429`, `503`, or times out.

## Realtime Model

The hub exposes sealed change hints and optional sealed change streams only:

```json
{
  "schema": "shippie.document.change-hint.v1",
  "documentId": "doc_x",
  "eventCount": 12,
  "snapshotCount": 1,
  "attachmentCount": 3,
  "latestEventCursor": "documents/v0/doc_x/events/...",
  "latestSnapshotCursor": "documents/v0/doc_x/snapshots/...",
  "updatedAt": "2026-05-12T09:00:00.000Z",
  "changed": true
}
```

The hint does not contain decrypted payloads. Open apps use local event/snapshot
counts first, with sealed cursors as fallback metadata, to avoid pulling full
encrypted event pages when their local copy is already fresh.

The change stream is Server-Sent Events over the same metadata. It sends
`ready`, `keepalive`, `change`, and `timeout` events. A `change` event only
means the sealed counts/cursors changed; the client still has to pull and
decrypt the encrypted events locally.

## Shutdown Portability

Shippie should keep the document schema stable, publish this spec, and maintain
a small reference reader/export verifier so a user with their own document key
can decrypt their data without the Shippie product staying online forever.

Reference reader command:

```sh
bun run --cwd packages/doc reference:read sealed-export.json --key <document-key>
```

The reader accepts sealed event/snapshot envelopes plus the user's key and
prints decrypted JSON. It is intentionally small so the trust claim can be
audited outside the app UI.
