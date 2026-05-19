# Shippie Local Tools Policy

This is the source of truth for what Shippie accepts into the public tool surface.

## The Promise

If it is on Shippie, data movement is visible. No hidden connections.

Users should not need to inspect source code before trusting a tool. A Shippie tool keeps user data on the device by default, works offline for its core workflow where possible, and never hides when it reaches an outside service.

Shippie is open by default. Makers can use useful external services, including AI and public APIs, but those connections must be scanned, disclosed, and visible in the app's Shippie surfaces. The platform blocks clearly unsafe classes such as trackers, ad networks, insecure transports, leaked secrets, and cloud structures that replace the local-tool data path.

The quiet state is unlabelled. Shippie does not add a "local only" badge to normal tools; it only raises a visible signal when something extra is happening, such as external AI, public APIs, payment providers, weather/location services, or creator-hosted services.

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
- External AI and service APIs, when the connection is disclosed to users and the app remains useful without hidden account lock-in.
- Third-party resource domains for images, fonts, maps, embeds, or scripts, when disclosed and not tracking/ad infrastructure.
- Explicit user export, such as CSV, ZIP, PDF, or a visible share/download action.

## Blocked

- Supabase, Firebase, Appwrite, PocketBase, Neon, Planetscale, or similar third-party user-data stores.
- Third-party auth required for the core workflow: Auth0, Clerk, Firebase Auth, Supabase Auth, NextAuth, and similar.
- Third-party analytics and trackers: Google Analytics, Google Tag Manager, Mixpanel, PostHog, Segment, Amplitude, Meta Pixel.
- Ad SDKs and ad networks.
- Insecure external `http:` or `ws:` connections.
- Leaked API keys or secrets in client bundles.
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

## External AI

Default stance: prefer local or Shippie-private AI for sensitive workflows.

External AI is allowed when it is visible. The runtime shows high-risk external AI connections on open, and Your Data lists the provider, purpose, and likely data categories. Clear per-action copy is still the best product experience. Examples:

- `Send this note to OpenAI`
- `Ask Claude about this receipt`
- `Translate with Gemini`

Silent background calls are warnings, not automatic rejection, unless they also use trackers, ads, insecure transports, leaked secrets, or a prohibited data-store/auth pattern. Shippie-proxied private AI is a future infrastructure option for keeping heavy models off the device while keeping the disclosure surface simple.

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
- **Legacy wrapped URL:** existing wrapped apps remain visibly marked as hosted upstreams. Shippie discloses the upstream domain because static bundle scanning is not available for that mode.

## Data Passport v1

Every local-data app can declare:

```json
{
  "data_passport": {
    "family": "receipt-inbox",
    "schema": "receipt-inbox.v1"
  }
}
```

v1 is compatibility metadata plus conservative install/update checks. It lets remixes and successors name compatible data families now, and the container can warn when an update or remix points at a different data family or a future schema that needs migration.

Future phases:

- v2: migration runners and rollback.

## Deployment Enforcement

The deploy pipeline blocks:

- blocked providers or auth libraries,
- tracking/ads,
- insecure external connections,
- bundled secrets or other security scanner blockers.

It allows with disclosure:

- declared public reference-data domains,
- Shippie relay/signal/backup/proof endpoints,
- static CDN assets,
- external AI and service writes,
- third-party scripts/resources that are not known tracking or ad infrastructure.

When a deploy is blocked, the maker sees conversion guidance instead of a vague failure:

> This tool stores user data on Supabase. Shippie tools keep user data on the device. Convert to `shippie.local.db`, or deploy the cloud app elsewhere.

When a deploy is allowed with warnings, the user sees the connection plainly in Shippie:

> This app uses external services: api.openai.com for external AI processing. Shippie allows this, and shows it so data movement is not hidden.

## Honest Limitations

Static scanning is not proof of perfect privacy. It catches common patterns and obvious network egress, but cannot fully prove semantic intent. The wrapper also records runtime-created external hosts locally on the user's device, so Your Data can show connections static scanning missed. Runtime proof events, package review, and user reporting still matter. Data Passport v1 also does not move data between incompatible tools yet; it makes compatibility visible before we add migration runners.

The policy keeps the default local-tool promise without turning Shippie into a locked-down platform. Open does not mean opaque: makers can connect things, and users can see what is connected.
