# Open Source Boundaries

Shippie is a source-available monorepo. This page explains what you can build against, what is platform-internal, and what is just an example.

## Licensing

- **Platform** (`apps/platform`, server-only packages) — AGPL-3.0. Network-accessible modifications must be shared back.
- **SDK, CLI, MCP server, templates** — MIT. You can build and ship tools without the AGPL reaching your app code.

## What is open-source (MIT)

The stable surface that makers and tool implementations build against:

- `shippie.json` manifest — identity, capabilities, data, provenance
- Intent catalog — `@shippie/intents`
- Runtime contract — `@shippie/local-runtime-contract`
- App package contract — `@shippie/app-package-contract`
- Deploy / remix / lineage flow

Published packages (built output is intentional):

- `@shippie/sdk` — tool-side SDK
- `@shippie/cli` — `shippie deploy` and `remix`
- `@shippie/mcp-server` — deploy/remix tools for agents
- `templates/` — starter showcases

## What is platform-internal (AGPL)

The hosted runtime and marketplace. `private: true` in `package.json` means not npm-published, not closed — source is in this repo.

- `apps/platform` — SvelteKit + Cloudflare Workers + D1/R2/KV/DO
- Server-only packages: deploy pipeline, policy scanner, trust ledger, proximity host

## What is neither (examples)

`apps/showcase-*` are first-party demos. Useful as references; not part of the dependable API surface.

## How a tool connects

A tool can arrive via CLI, zip upload, local folder, GitHub repo, remix, or trial. GitHub is a first-class source — it gives the cleanest provenance — but it is never required. See `docs/contracts/provenance.md`.
