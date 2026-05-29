# Build on Shippie

**Local tools that know each other.**

Draft v2 · 2026-05-19 · Devante Providence

---

## The Promise

For users:

> If it is on Shippie, data movement is visible. No hidden connections.

For makers:

> Build on Shippie. One-line database. Zero config. Deploy in under a minute. Your tool connects to every other tool in the ecosystem automatically.

For enterprises:

> Every tool starts from the device. Every outside connection is scanned and disclosed. No per-tool guesswork required.

For the world:

> Not everything needs to be an app.
> Not everything needs a server.
> Not everything needs your email.
>
> Some things should just be tools.
> Local. Private. Connected to each other. Yours.
>
> Build on Shippie.

---

## The Category

Cloud platforms deploy cloud apps.

Netlify deploys static sites.

Shippie deploys local tools.

A Shippie tool runs on the user's device, stores its data locally by default, works offline for its core workflow where possible, prefers local or private AI when it needs intelligence, and shares useful signals with other Shippie tools through user-controlled primitives.

The old web default was: create an account, send your data to a server, hope the company behaves.

The Shippie default is: tap a tool, use it immediately, keep data on your device, and see clearly when a tool connects outside.

---

## The Rule

Local by default. Open by design. No hidden data movement.

Allowed:

- weather forecasts, exchange rates, public sports scores, public reference data,
- encrypted Shippie backup chosen by the user,
- encrypted Shippie relay for live rooms that Shippie cannot read,
- external AI and service APIs when disclosed to the user,
- third-party resources that are not tracking or ad infrastructure,
- explicit user exports such as CSV, ZIP, PDF, or share sheets.

Blocked:

- hosted user databases,
- external auth required for core use,
- trackers, ads, analytics pixels,
- insecure external connections,
- leaked API keys or secrets,
- cloud apps reverse-proxied into a Shippie costume.

This is not purity for its own sake. It is the product. The value is that a user never has to inspect code to know what a Shippie tool can connect to.

---

## The Maker Surface

The maker entry point is deliberately small:

```ts
import { shippie } from '@shippie/sdk';

await shippie.local.db.save('receipts', receipt);
const receipts = await shippie.local.db.list('receipts');

await shippie.local.files.write('receipt.jpg', photoBlob);
await shippie.local.ai.classify('Uber to Heathrow', ['travel', 'food']);
```

Then:

```sh
shippie deploy ./dist
```

The platform handles installability, offline shell, local runtime, proof events, Your Data, secure backup, portable packages, and marketplace discovery.

No database provisioning. No auth flow. No server bill. No privacy policy gymnastics.

---

## What Shippie Provides

**Local database.** A device-local database API backed by browser storage and the Shippie runtime.

**Local files.** Photos, exports, and attachments stay on the user's device unless exported or backed up as sealed data.

**Local AI.** Classification, embeddings, sentiment, and vision tasks run locally when available.

**Intents.** Tools can declare what they provide and consume. A receipt tool can emit expenses. A weekly summary can combine receipts, movement, sleep, and habits without sending those records to a server.

**Secure backup.** Optional encrypted continuity. Backup is not identity. The local copy is canonical.

**Private relay.** Live rooms and multiplayer can use Shippie's relay only when payloads are encrypted and opaque to the platform.

**Proof.** Runtime events can prove that a tool works offline, used local storage, ran local AI, wrote backup, or joined a private relay.

---

## Enforcement

Shippie is not relying on a checkbox.

Every browser zip upload, trial upload, CLI deploy, MCP deploy, and workspace deploy runs the same Local Tool policy scanner before the bundle is published.

The scanner blocks common violations:

- Supabase, Firebase, Appwrite, PocketBase, Neon, Planetscale, and similar third-party stores,
- Auth0, Clerk, Firebase Auth, Supabase Auth, NextAuth, and similar auth dependencies,
- Google Analytics, Tag Manager, Mixpanel, PostHog, Segment, Meta Pixel, and ad SDKs,
- insecure transports and bundled secrets.

It allows public reference data, external AI, service writes, and third-party resources with disclosure. Quiet local/default tools stay visually quiet; Shippie adds labels only when something extra is happening. High-risk connections are visible at runtime and in Your Data; suspicious query strings are flagged for review.

Hosted URL wrapping is retired for marketplace publishing because a reverse proxy cannot prove the local-tool promise.

---

## Data Continuity Without Migration Fatigue

If tools continuously improve, users should not keep manually migrating.

Shippie starts with Data Passport v0:

```json
{
  "data_passport": {
    "family": "receipt-inbox",
    "schema": "receipt-inbox.v1"
  }
}
```

This is not a full migration system yet. It is the first honest step: tools declare the family of data they own. Remixes and successors can declare compatibility with that family. Later phases add install-time compatibility checks, migration runners, and rollback.

The long-term goal is simple: a better tool can inherit the user's old data because both tools speak the same local data passport.

---

## Why This Matters

For individuals, Shippie makes useful software feel lighter: no account, no upload, no surveillance, no app store.

For makers, Shippie makes local-first easier than cloud-first: one-line database, zero setup, deploy from the browser, CLI, or MCP.

For schools, hospitals, teams, and privacy-sensitive organizations, Shippie gives a stronger security story than per-app auditing:

> Every tool starts local, and every outside connection is visible.

The narrower marketplace is the moat. Fewer tools, clearer guarantee, deeper trust.

---

## Honest Limitations

Static scanning cannot perfectly prove privacy. It catches common cloud patterns and obvious egress, but the wrapper also records runtime-created external hosts locally on the user's device. Runtime proof, package review, and user reporting still matter.

Local AI depends on device capability and model availability. Some tasks will need explicit user-approved external calls until local models are good enough.

Data Passport v0 is metadata, not migration magic. Compatibility checks and migration runners come later.

The policy will reject some apps that could technically be useful. That is the trade. Shippie is not trying to be a worse cloud platform. Shippie is trying to make local tools a category of their own.

---

## The Line

Not everything needs to be an app.

Not everything needs a server.

Not everything needs your email.

Some things should just be tools.

Local. Private. Connected to each other. Yours.

Build on Shippie.
