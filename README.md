# Shippie

> Built it with AI. Installed on a phone. 60 seconds.

No app store. No review. No 30% cut. Your data stays on your backend. Open source.

---

Shippie is the open alternative to the App Store for web apps. Ship a PWA to a real URL, installable on any phone, in under a minute — whether you're building an app, a web app, or a website.

| Type | For | Why Shippie |
|---|---|---|
| **App** | Phone-first micro-tools built with AI | Installable, works offline, no review queue |
| **Web app** | Internal tools, dashboards, productivity | Tabs, URLs, desktop-friendly, ship in seconds |
| **Website** | Portfolios, docs, landing pages | Static hosting + marketplace + feedback built in |

## Deploy one

```bash
# From the terminal
npx @shippie/cli deploy ./dist
```

Live at `https://your-app.shippie.app` in 30 seconds. Or drop a zip at [shippie.app](https://shippie.app). Or `"deploy this to Shippie"` from Claude Code.

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
- **BYO backend.** Shippie hosts your frontend. Auth/storage/db come from your own Supabase or Firebase. We never touch end-user data.
- **PWA-first, honestly.** No native wrappers. The web, installed. Things you can't ship through an app store, you can ship here in a minute.

## Links

- [Try it — live trial](https://shippie.app) — drop a zip, get a URL, no signup
- [Examples gallery](https://shippie.app/examples) — production apps to clone
- [Getting started](docs/getting-started.md)
- [SDK reference](docs/sdk-reference.md)
- [Self-hosting](docs/self-hosting.md)
- [Architecture](docs/architecture.md)
- [Contributing](CONTRIBUTING.md)

## License

Platform: [AGPL-3.0](LICENSE). SDK / CLI / MCP / templates: [MIT](LICENSE-MIT).
