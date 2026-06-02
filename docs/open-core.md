# What's open source here

Shippie is a source-available monorepo. This page draws the boundary the README
references: which parts are the **open-source core** you can build tools against,
which are **internal platform code**, and which are **examples**. The goal is
legibility — a stranger should be able to tell, in one read, what they can depend on.

> Licensing (see [`LICENSE`](../LICENSE) / [`LICENSE-MIT`](../LICENSE-MIT)):
> the **platform** is AGPL-3.0; the **SDK, CLI, MCP server, and templates** are MIT
> so you can build and ship tools without the AGPL reaching your app code.

## The five buckets

### 1. Open-source core — the contracts + the tool-facing surface
The stable surface a maker or another implementation builds against. Documented in
[`docs/contracts/`](contracts/) and the JSON Schema at
[`/schemas/app.json`](../apps/platform/static/schemas/app.json).

- **`shippie.json` manifest** — identity, capabilities, data, source/provenance.
- **Intent catalog** — `@shippie/intents` (`CANONICAL_INTENTS`).
- **Runtime contract** — `@shippie/local-runtime-contract` (capabilities, availability).
- **App package contract** — `@shippie/app-package-contract` (permissions, trust, portable package).
- **Deploy / remix / lineage flow** — CLI deploy, `--remix`, source-repo normalization, lineage.

### 2. Publishable packages (MIT)
Meant to be consumed outside this repo — built output (`dist`) is legitimate here.

- `@shippie/sdk` — the tool-side SDK.
- `@shippie/cli` — `shippie deploy` / `remix`.
- `@shippie/mcp-server` — deploy/remix tools for agents.
- `templates/` — starter showcases.

### 3. Internal platform code (AGPL)
The hosted runtime + marketplace. `private: true` in `package.json` here means
**"not npm-published,"** not "closed" — the source is in this repo. Network-accessible
modifications must be shared back (AGPL).

- `apps/platform` — SvelteKit + Cloudflare Workers + D1/R2/KV/DO.
- Server-only packages: deploy pipeline, analyse, trust-ledger, proximity host, etc.

### 4. Private / user apps
Sensitive or personal tools are **not** part of the open-source identity. A tool can be
private and still live in the marketplace; provenance fields simply say less about it.

### 5. Examples / showcases
`apps/showcase-*` — first-party demos of the contracts above. Useful as references,
not part of the dependable API surface.

## How a tool connects (deploy-neutral)

A tool can come from **CLI, zip/upload, a local folder, a GitHub repo, a remix, or a
trial** (`apps.source_type` records which). GitHub is a first-class *source* — it gives
the cleanest provenance (source, license, lineage, remix) — but it is never required.
See [`docs/contracts/provenance.md`](contracts/provenance.md).
