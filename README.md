# Shippie

Shippie is a marketplace and runtime for local tools — PWAs that run on the user's device, store data locally, work offline, and get a real URL in under a minute.

No app store. No review queue. No 30% cut.

---

## Quick start

**Deploy from the CLI:**
```bash
npx @shippie/cli deploy ./dist
```

**Drop a zip:** [shippie.app/new](https://shippie.app/new)

Live at `https://your-app.shippie.app` in under a minute.

**Remix a public tool:**
```bash
npx @shippie/cli remix recipe-saver
npx @shippie/cli deploy ./dist --slug recipe-saver-remix --remix recipe-saver
```

---

## Repo structure

```
apps/
  platform/          # SvelteKit + Cloudflare Workers — the main platform
  shippie-ai/        # AI iframe (Vite + Workbox, ai.shippie.app)
  showcase-*/        # Showcase apps (Vite + React)
packages/
  sdk/               # @shippie/sdk — tool authoring API
  cli/               # @shippie/cli — deploy, remix, init
  mcp-server/        # MCP server for AI-native deploys
  iframe-sdk/        # Bridge for tools running in the Shippie shell
  local-db/          # Local-first storage primitives
  showcase-kit-v2/   # Shared showcase UI primitives (logic-only, no CSS)
  ...
services/
  hub/               # Hub venue device service (Bun + Docker)
docs/                # Architecture, contracts, self-hosting, SDK reference
templates/           # Starter templates for new tools
```

---

## Dev setup

Requires [Bun](https://bun.sh) and [Wrangler](https://developers.cloudflare.com/workers/wrangler/).

```bash
bun install

# Run the platform locally
cd apps/platform
bun run db:migrate:local   # required on first run — /apps 500s without it
bun run dev                # starts on port 4101 (wrangler dev)

# Health check (typecheck + test + build)
bun run health
```

The platform runs on Cloudflare Workers + D1 + R2 + KV + Durable Objects. Local dev uses `wrangler dev --local`.

---

## How it works

1. **Build any PWA** — plain HTML/JS, React, Svelte, whatever builds to a `dist/`.
2. **Deploy in 60 seconds** — CLI or zip upload; Shippie serves it from a subdomain.
3. **Users install it** — PWA install prompt, offline after first load, data stays on device.
4. **Makers improve it** — push updates; users get them on next open, local data intact.

Tools opt into remixing by publishing source + a license. Shippie tracks lineage across CLI, MCP, web upload, and GitHub deploys.

---

## Why Shippie

| | Shippie | App Store | Generic hosting |
|---|---|---|---|
| Time to live | 60s | 14 days | 60s |
| Revenue share | 0% | 30% | 0% |
| Installable on phones | yes (PWA) | yes (native) | DIY |
| User data stays local | yes | no | yes |
| Open source | yes (AGPL) | no | no |

---

## Docs

- [Getting started](docs/getting-started.md)
- [SDK reference](docs/sdk-reference.md)
- [Architecture](docs/architecture.md)
- [Self-hosting](docs/self-hosting.md)
- [What's open source](docs/open-core.md) — the core/internal/publishable boundary
- [Contracts](docs/contracts/) — manifest, intents, permissions, provenance & lineage
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

---

## License

Platform: [AGPL-3.0](LICENSE). SDK / CLI / MCP / templates: [MIT](LICENSE-MIT).
