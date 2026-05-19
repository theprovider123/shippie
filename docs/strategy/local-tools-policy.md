# Shippie Local Tools Policy

This is the source of truth for what Shippie accepts into the public tool surface.

## The Promise

If it is on Shippie, it is private. No exceptions.

Users should not need to inspect a badge before trusting a tool. A Shippie tool keeps user data on the device by default, works offline for its core workflow, and never requires a third-party account to be useful.

## One Kind, Many Capabilities

The public app kind is **Local Tool**.

Capabilities are additive facts about the tool:

- `worksOffline`
- `secureBackup`
- `referenceData`
- `localAi`
- `privateRelay`
- `sharesIntents`
- `localDb`
- `localFiles`

This replaces the old Local / Connected / Cloud user taxonomy. Internally, legacy kind detection may still appear in reports to help migrate older apps, but it is not the user promise.

## Allowed

- `shippie.local.db` for durable records.
- `shippie.local.files` for photos, exports, and attachments.
- `shippie.local.ai` for local inference.
- Shippie intents for cross-tool data the user can understand and control.
- Shippie secure backup when the user opts in. Backup is continuity, not identity.
- Shippie relay/signal for live collaboration when payloads are encrypted and opaque to Shippie.
- Public reference-data APIs, when user data is not sent out.
- Explicit user export, such as CSV, ZIP, PDF, or a visible share/download action.

## Blocked

- Supabase, Firebase, Appwrite, PocketBase, Neon, Planetscale, or similar third-party user-data stores.
- Third-party auth required for the core workflow: Auth0, Clerk, Firebase Auth, Supabase Auth, NextAuth, and similar.
- Third-party analytics and trackers: Google Analytics, Google Tag Manager, Mixpanel, PostHog, Segment, Amplitude, Meta Pixel.
- Ad SDKs and ad networks.
- External `POST`, `PUT`, `PATCH`, or `DELETE` requests that can carry user content.
- Silent external LLM calls with user content.
- URL wrapping hosted cloud apps into the marketplace. A reverse proxy cannot prove the local-tool promise.

## The Asymmetry Rule

Reference data may come in. User data does not go out.

Examples:

- A weather app can fetch public weather data and cache it locally.
- A currency converter can fetch exchange rates and store them locally.
- A receipt tool cannot send receipts to a hosted OCR API unless the user explicitly chooses that export/send action.

`GET` is not automatically safe. Query strings can carry private context, so reference APIs should receive category-like terms, not names, emails, notes, prompts, or personal context.

## Multiplayer

Shippie's relay is the only allowed transport for live user data because Shippie cannot read encrypted payloads.

Match Room, Live Room, Crewtrip, and future multiplayer tools must declare the `privateRelay` capability. The user-facing language is:

> Private relay via Shippie. Encrypted live data moves between your devices or room members; Shippie cannot read it.

## External LLMs

Default stance: local AI only.

Exception: user-explicit-per-call external AI is allowed when the action clearly says what will be sent and to whom. Examples:

- `Send this note to OpenAI`
- `Ask Claude about this receipt`
- `Translate with Gemini`

Silent background calls are blocked. Shippie-proxied cloud AI is a future infrastructure option, not the launch path.

## Secure Backup

Private sync is not a separate app kind. It is a capability of a local tool.

Backup stores sealed copies that Shippie cannot open. The local copy remains canonical. Users can turn backup off, move to a new phone, restore from a sealed copy, export, or delete local data.

## Maker Entry Point

Makers should start with the local SDK:

```ts
import { shippie } from '@shippie/sdk';

await shippie.local.db.save('receipts', receipt);
const receipts = await shippie.local.db.list('receipts');
await shippie.local.files.write('receipt.jpg', photoBlob);
await shippie.local.ai.classify('Uber to Heathrow', ['travel', 'food']);
```

Then deploy:

```sh
shippie deploy ./dist
```

The same Local Tool policy scanner runs for browser zip uploads, trial uploads, CLI deploys, MCP deploys, and workspace deploys.

## Upload Paths

- **Browser zip upload:** accepted when the extracted bundle passes preflight, security scan, and Local Tool policy.
- **Trial upload:** same scanner, shorter TTL.
- **CLI deploy:** same API path and scanner.
- **MCP deploy:** same API path and scanner.
- **Workspace deploy:** each app is scanned independently.
- **Hosted URL wrap:** retired for marketplace publishing. Convert to a local tool and upload the built bundle.

## Data Passport v0

Every local-data app can declare:

```json
{
  "data_passport": {
    "family": "receipt-inbox",
    "schema": "receipt-inbox.v1"
  }
}
```

v0 is metadata only. It lets remixes and successors name compatible data families now, without pretending migration runners and rollback are already finished.

Future phases:

- v1: install-time compatibility checks.
- v2: migration runners and rollback.

## Deployment Enforcement

The deploy pipeline blocks:

- blocked providers or auth libraries,
- tracking/ads,
- external user-data writes,
- silent external AI endpoints.

It allows with disclosure:

- declared public reference-data domains,
- Shippie relay/signal/backup/proof endpoints,
- static CDN assets.

When a deploy is blocked, the maker sees conversion guidance instead of a vague failure:

> This tool stores user data on Supabase. Shippie tools keep user data on the device. Convert to `shippie.local.db`, or deploy the cloud app elsewhere.

## Honest Limitations

Static scanning is not proof of perfect privacy. It catches common patterns and obvious network egress, but cannot fully prove semantic intent. Runtime proof events, package review, and user reporting still matter.

The policy also narrows the marketplace. That is intentional. Fewer tools with a hard guarantee are better than many tools that make users check fine print.
