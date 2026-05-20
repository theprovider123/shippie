# Shippie

> Built it with AI. Opened on a phone. 60 seconds.

No app store. No review. No 30% cut. Your data stays on the device. Open source.

---

Shippie is the open home for local tools: small PWAs that keep user data on the device, work offline after first load, and can still get a real URL in under a minute.

| Type | For | Why Shippie |
|---|---|---|
| **Local tool** | Phone-first utilities built with AI | Installable, offline-first, no account required |
| **Remixable tool** | Tools makers continuously improve | Local data + source lineage so users do not lose their stuff |
| **Team/internal tool** | Lightweight workflows and dashboards | URL deploys, desktop-friendly, visible outside connections |

## Deploy one

```bash
# From the terminal
npx @shippie/cli deploy ./dist
```

Live at `https://your-app.shippie.app` in under a minute. Or drop a zip at [shippie.app/new](https://shippie.app/new). Or ask Claude Code to deploy a local tool to Shippie.

## Remix one

Public apps can opt into remixing by publishing source, a license, and remix permission. A GitHub account is useful for fork history, but Shippie lineage works from CLI, MCP, web upload, workspace deploys, and GitHub deploys.

```bash
npx @shippie/cli remix recipe-saver
npx @shippie/cli deploy ./dist --slug recipe-saver-remix --remix recipe-saver
```

## How Shippie compares

| | Shippie | App Store | Generic Hosting | No-Code App Builders |
|---|---|---|---|---|
| **Time to live** | 60s | 14 days | 60s | minutes |
| **Revenue share** | 0% | 30% | 0% | — |
| **Review queue** | none | yes | none | none |
| **Installable on phones** | yes (PWA) | yes (native) | DIY | partial |
| **Your data stays yours** | yes | no | yes | no |
| **Open source** | yes (AGPL) | no | no | no |

## Why we built it this way

- **Open source (AGPL).** The platform, the SDK, the MCP server, the CLI. Fork it. Self-host it. Network-accessible modifications must be shared back.
- **Local by default.** Shippie hosts the tool package. Local-first storage, files, and AI run on the user's device; outside connections must say so clearly.
- **PWA-first, honestly.** No native wrappers. The web, installed. Things you can't ship through an app store, you can ship here in a minute.

## Links

- [Try a tool](https://shippie.app) — open the launcher, tap one, no signup
- [Build a tool](https://shippie.app/new) — drop a zip, get a URL, 60 seconds
- [Remixable tools](https://shippie.app/?remixable=1) — production tools to clone
- [Getting started](docs/getting-started.md)
- [SDK reference](docs/sdk-reference.md)
- [Self-hosting](docs/self-hosting.md)
- [Architecture](docs/architecture.md)
- [Contributing](CONTRIBUTING.md)

## License

Platform: [AGPL-3.0](LICENSE). SDK / CLI / MCP / templates: [MIT](LICENSE-MIT).
