# Shippie App Data Inheritance v0

Every Shippie app, first-party or uploaded, inherits the same private data layer.
This is a platform rule, not an optional maker feature.

## User Promise

- The app works without an account.
- Data is useful immediately on this device.
- Sealed copies can be stored by Shippie, but Shippie cannot open them.
- A user can add another device or move to a new phone from **Your Data**.
- Existing local work must survive upgrades into the Document layer.

## Required App Hooks

Every app, first-party or uploaded, gets the platform contract through
`shippie.json`. This is the default for new apps created by `shippie init`:

```json
{
  "data": {
    "mode": "shippie-documents",
    "documents": ["main"],
    "attachments": false,
    "recovery": "inherited",
    "migrations": "snapshot-v0",
    "snapshots": "inherited",
    "media": "none",
    "realtime": "inherited"
  }
}
```

`mode` options:

- `shippie-documents`: the app's private state is encrypted into Shippie Documents and inherits **Your Data**.
- `local-only`: the app intentionally stays on this device; sealed copies and cross-device handover are off.
- `none`: the app stores no durable private data.

Invariant: raw document keys are never uploaded. Shippie may relay wrapped access
bundles and store sealed encrypted blobs, but Shippie cannot open the user data.

Builder tools must enforce the same contract:

- SDK: `@shippie/sdk/data-standard` exports the version, types, and default policy helper.
- CLI: `shippie data doctor` validates a local app before deploy.
- MCP: `data_standard_doc` and `data_doctor` let AI agents build against the same rules.

Apps using durable state must expose:

```ts
interface ShippieDataAdapter {
  privateSync(): Promise<PrivateSyncPanelState>;
  buildAccessBundle(): Promise<DocumentAccessBundle | null>;
  receiveAccessBundle(bundle: DocumentAccessBundle): Promise<void>;
  migrateLegacyLocalData(): Promise<MigrationResult>;
}
```

The platform wrapper renders **Your Data**. The app supplies only the hooks.

## Migration Rule

Migration is copy-first:

1. Detect legacy local stores.
2. Convert them into Document events.
3. Rebuild state from the encrypted event log.
4. Compare rebuilt state with the legacy state.
5. Mark migration complete only after the comparison passes.
6. Keep legacy local data until the app has synced at least one sealed copy.

No migration may delete a user’s working local data as part of the same step that creates the Document copy.

## Handover Rule

The default cross-device handover is a wrapped access-bundle relay:

1. New device generates a temporary ECDH key pair.
2. New device posts only its temporary public key to Shippie.
3. Old device wraps the app’s access bundle to that public key.
4. Shippie relays the wrapped bundle for a short TTL.
5. New device unwraps locally and imports the document pointers.

Invariant: raw document keys are never uploaded.

## Replica Health

Every app should report safe copies in the same language:

- This device
- Sealed Shippie copy
- Other member devices
- Optional self-hosted hub

User copy should stay calm: “Saved here. Recoverable later. Private throughout.”

Engineering copy may say Document, replica, encrypted event log, or sealed cloud.

## Abuse And Cost Caps

Apps get unlimited-feeling use for normal users, while the platform enforces payer-side caps:

- small event envelopes only
- larger files stored as sealed attachments
- reducer checkpoints stored as sealed snapshots for fast restore
- file/image apps use encrypted chunked media, not raw attachment bytes
- realtime sealed sync inherited from `@shippie/doc`, not hand-rolled per app
- per-document daily write budgets
- per-IP daily write budgets
- per-document daily attachment byte budgets
- per-attachment maximum size

When a cap is hit, the app must keep the local outbox and retry later.

## Realtime Rule

Apps commit locally first and render immediately. The SDK then coalesces pending
events into a short sealed-cloud push, pulls fresh remote events on a fast
visible-tab cadence, slows down while hidden, and backs off after offline/quota
errors. App code should not own polling loops, cursor math, or retry queues.

Open apps should use sealed change hints before full event pulls. A hint exposes
only document id, latest sealed cursors, and updated-at timing; it never exposes
event kind, payload, reducer state, or raw keys.

Multiple tabs for the same app/document should use SDK tab leadership. One tab
owns network sync, other tabs write locally and ask the leader to flush. If the
leader disappears, the lock expires and another tab takes over.

## Torture Harness

Before release, run:

```sh
bun run --cwd apps/platform torture:sealed-cloud -- --origin https://shippie.app --media 1048576,5242880
```

The harness checks:

- local write renders before cloud
- sealed push and second-device pull
- change-hint fresh/stale paths
- metadata-only change stream wakeups
- snapshot-first restore
- offline outbox retention
- encrypted chunked media round trips

## v0 Scope

The first v0 app is Match Room plus Tournament Fantasy.

The generic inheritance baseline applies to every app opened through the Shippie
wrapper. The generic baseline captures browser-local state into a private app
safety document for sealed handover. App-specific reducers, conflict handling,
and richer schema migrations still happen app-by-app.

The next bespoke proof app should be one local-data-heavy app, such as Journal
or Recipe.
