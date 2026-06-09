# App Kinds

## The only kind: Local Tool

Every app on Shippie is a **Local Tool** — it runs on the user's device, stores data locally, works offline by default, and never silently sends user data anywhere.

There is no longer a public taxonomy of Local / Connected / Cloud. That distinction is retired.

## Capabilities

A tool declares what it can do using capabilities:

- **works offline** — functions without a network connection
- **secure backup** — user data can be backed up (sealed; Shippie cannot read it)
- **reference data used** — ships with static reference data
- **local AI** — runs inference on-device
- **private relay via Shippie** — uses Shippie's relay for tool-to-tool or user-to-user communication
- **shares with my tools** — exchanges data with other tools the user has installed
- **local database** — persists structured data locally
- **local files** — reads or writes files locally

## The Rule

A tool must not require external auth for core use, must not send user data to third-party storage silently, and must not include trackers or ads. The deploy scanner enforces this at upload time.

The full policy is in `docs/strategy/local-tools-policy.md`.

## Internal note

Legacy kind detection (`local` / `connected` / `cloud`) still exists in the platform to support migration of older apps and historical deploy reports. It is not product language and must not appear in new UI or documentation.
