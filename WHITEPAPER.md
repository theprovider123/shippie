# Build on Shippie

**Local tools that know each other.**

Devante Providence · June 2026

---

## The Promise

For users:

> If it is on Shippie, data movement is visible. No hidden connections.

For makers:

> Build on Shippie. One-line database. Zero config. Deploy in under a minute. Your tool can connect to other Shippie tools through user-controlled primitives.

For enterprises:

> Every tool starts from the device. Outside connections are scanned, disclosed, and visible. Less per-tool guesswork required.

For the world:

> Not everything needs to be an app.
> Not everything needs a server.
> Not everything needs your email.
>
> Some things should just be tools.
> Local. Private. Connected to each other. Yours.

---

## The Category

Cloud platforms deploy cloud apps. Netlify deploys static sites. Shippie deploys local tools.

A Shippie tool runs on the user's device, stores its data locally by default, works offline for its core workflow where possible, prefers local or private AI when it needs intelligence, and shares useful signals with other Shippie tools through user-controlled primitives.

The old web default: create an account, send your data to a server, hope the company behaves.

The Shippie default: tap a tool, use it immediately, keep data on your device, and see clearly when a tool connects outside.

---

## The Rule

**Local by default. Open by design. No hidden data movement.**

Allowed:

- Weather forecasts, exchange rates, public sports scores, public reference data
- Encrypted Shippie backup chosen by the user
- Encrypted Shippie relay for live rooms that Shippie cannot read
- External AI and service APIs when disclosed to the user
- Third-party resources that are not tracking or ad infrastructure
- Explicit user exports: CSV, ZIP, PDF, share sheets

Blocked:

- Hosted user databases
- External auth required for core use
- Trackers, ads, analytics pixels
- Insecure external connections
- Leaked API keys or secrets
- Cloud apps reverse-proxied into a Shippie costume

This is not purity for its own sake. It is the product. The value is that a user should not have to inspect code to know what a Shippie tool can connect to.

---

## The Maker Surface

The entry point is deliberately small:

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

No database provisioning. No auth flow. No server bill for the default local path. Any outside connection still needs clear disclosure.

---

## What Shippie Provides

**Local database.** A device-local database API backed by browser storage and the Shippie runtime. No provisioning, no credentials.

**Local files.** Photos, exports, and attachments stay on the user's device unless exported or backed up as sealed data.

**Local AI.** Classification, embeddings, sentiment, and vision tasks run locally when available. External AI calls are disclosed.

**Intents.** Tools can declare what they provide and consume. A receipt tool can emit expenses. A weekly summary can combine receipts, movement, sleep, and habits without sending those records to a server.

**Secure backup.** Optional encrypted continuity. Backup is not identity. The local copy is canonical.

**Private relay.** Live rooms and multiplayer use Shippie's relay only when payloads are encrypted and opaque to the platform.

**Feed Protocol.** Public feeds per app slug and feed ID — structured data a tool can publish or subscribe to without a bespoke backend.

**Proof.** Runtime events prove that a tool works offline, used local storage, ran local AI, wrote backup, or joined a private relay.

---

## Enforcement

Shippie does not rely on a checkbox.

Every upload — browser zip, trial, CLI, MCP, or workspace deploy — runs the same Local Tool policy scanner before the bundle is published. The scanner is live today.

The scanner blocks common violations:

- Supabase, Firebase, Appwrite, PocketBase, Neon, Planetscale, and similar third-party stores
- Auth0, Clerk, Firebase Auth, Supabase Auth, NextAuth, and similar auth dependencies
- Google Analytics, Tag Manager, Mixpanel, PostHog, Segment, Meta Pixel, and ad SDKs
- Insecure transports and bundled secrets

It allows public reference data, external AI, service writes, and third-party resources with disclosure. Quiet local tools stay visually quiet — labels appear only when something extra is happening. High-risk connections are visible at runtime and in Your Data. Suspicious patterns are flagged for review.

Beyond static scanning, Shippie runs:

- A kill switch for published apps (KV-backed, immediate effect)
- User reports via the app detail card (app_reports table)
- Runtime behavior delta monitoring
- Transparency badges shown per-tool based on what the scanner found

Hosted URL wrapping is retired for marketplace publishing. A reverse proxy cannot prove the local-tool promise.

---

## How Tools Are Isolated

Each published app is served from its own subdomain. The platform enforces:

- `frame-ancestors` CSP so apps cannot escape their iframe context
- No cross-origin data access between tools except through declared Intents
- Maker-visible audit trail in the App Health panel

---

## Data Continuity

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

Tools declare the family of data they own. Remixes and successors can declare compatibility with that family. Later phases add install-time compatibility checks, migration runners, and rollback.

The long-term goal: a better tool can inherit the user's old data because both tools speak the same local data passport.

---

## The Platform Today (June 2026)

**Nav:** Dock (your apps + recent) / Tools (discover + search) / You (identity + data + settings)

**Maker backend:** App Health, Dock feedback, identity and reply history, Your Data — all live.

**Upload → deploy → serve flow:** zip upload → policy scan → R2 store → subdomain serve. Makers get a real-time health panel and per-app feedback thread.

**Safety enforcement:** Kill switch, user reports, behavior delta monitoring, and transparency badges are all running in production.

**Feed Protocol:** Public feeds per app slug and feed ID are available to makers.

**Showcase apps:** Coffee (Brew/Cellar/World) and Golazo (FreeKick/Penalty with leaderboards) are live examples of what the SDK can do.

---

## Why This Matters

For individuals, Shippie makes useful software feel lighter: no account, no upload, no surveillance, no app store.

For makers, Shippie makes local-first easier than cloud-first: one-line database, zero setup, deploy from the browser, CLI, or MCP.

For schools, teams, and privacy-sensitive organizations, Shippie gives a simpler starting point for security review than ad-hoc cloud apps:

> Every tool starts local, and outside connections are visible.

The narrower marketplace is the moat. Fewer tools, clearer claims, deeper trust.

---

## Honest Limitations

Static scanning cannot perfectly prove privacy. It catches common cloud patterns and obvious egress, but it can miss runtime-created external hosts. Runtime proof, package review, and user reporting still matter — and all three are live.

Local AI depends on device capability and model availability. Some tasks will need explicit user-approved external calls until local models are good enough.

Data Passport v0 is metadata, not migration magic. Compatibility checks and migration runners come in a later phase.

The policy will reject some apps that could technically be useful. That is the trade. Shippie is not trying to be a worse cloud platform. Shippie is trying to make local tools a category of their own.

---

## The Line

Not everything needs to be an app.

Not everything needs a server.

Not everything needs your email.

Some things should just be tools.

Local. Private. Connected to each other. Yours.

Build on Shippie.
