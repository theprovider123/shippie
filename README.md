# Shippie

> Built it with AI. Opened on a phone. 60 seconds.

No app store. No review. No 30% cut. Your data stays on the device. Open source.

---

Shippie is the open home for small tools that run on real devices. Ship a PWA to a real URL, installable on any phone, in under a minute — whether you're building a micro-app, a web app, or a website.

| Type | For | Why Shippie |
|---|---|---|
| **Micro-app** | Phone-first tools built with AI | Installable, works offline, no review queue |
| **Web app** | Internal tools, dashboards, productivity | Tabs, URLs, desktop-friendly, ship in seconds |
| **Website** | Portfolios, docs, landing pages | Static hosting + marketplace + feedback built in |

## Deploy one

```bash
# From the terminal
npx @shippie/cli deploy ./dist
```

Live at `https://your-app.shippie.app` in 30 seconds. Or drop a zip at [shippie.app/build](https://shippie.app/build). Or `"deploy this to Shippie"` from Claude Code.

## Remix one

Public apps can opt into remixing by publishing source, a license, and remix permission. A GitHub account is useful for fork history, but Shippie lineage works from CLI, MCP, web upload, workspace deploys, and GitHub deploys.

```bash
npx @shippie/cli remix recipe-saver
npx @shippie/cli deploy ./dist --slug recipe-saver-remix --remix recipe-saver
```

## How Shippie compares

| | Shippie | App Store | Vercel | Glide |
|---|---|---|---|---|
| **Time to live** | 60s | 14 days | 60s | minutes |
| **Revenue share** | 0% | 30% | 0% | — |
| **Review queue** | none | yes | none | none |
| **Installable on phones** | yes (PWA) | yes (native) | DIY | partial |
| **Your data stays yours** | yes | no | yes | no |
| **Open source** | yes (AGPL) | no | no | no |

## Why we built it this way

- **Open source (AGPL).** The platform, the SDK, the MCP server, the CLI. Fork it. Self-host it. Network-accessible modifications must be shared back.
- **Local by default.** Shippie hosts the tool package. Local-first storage, files, and AI run on the user's device; cloud-backed tools must say so clearly.
- **PWA-first, honestly.** No native wrappers. The web, installed. Things you can't ship through an app store, you can ship here in a minute.

## Links

- [Try a tool](https://shippie.app) — open the launcher, tap one, no signup
- [Build a tool](https://shippie.app/build) — drop a zip, get a URL, 60 seconds
- [Examples gallery](https://shippie.app/examples) — production tools to clone
- [Getting started](docs/getting-started.md)
- [SDK reference](docs/sdk-reference.md)
- [Self-hosting](docs/self-hosting.md)
- [Architecture](docs/architecture.md)
- [Contributing](CONTRIBUTING.md)

## License

Platform: [AGPL-3.0](LICENSE). SDK / CLI / MCP / templates: [MIT](LICENSE-MIT).
