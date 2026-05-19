# Getting Started with Shippie

Deploy your first local tool in under 5 minutes. Before you start, pick what you're shipping.

## Pick your type

Shippie supports three first-class project types. They deploy the same way; they live in different shelves.

| Type | What it is | Best for |
|---|---|---|
| **app** | Phone-first PWA. Installable. Works offline. | AI micro-tools, habit trackers, capture tools, single-purpose utilities |
| **web_app** | Browser-first. Tabs, URLs, desktop-friendly. | Internal tools, dashboards, authoring tools, productivity |
| **website** | Static + light runtime. No install. | Portfolios, docs, landing pages, marketing sites |

Pick one now — every deploy path (CLI, upload, MCP, GitHub) asks for this.

## Option 1: CLI (recommended)

```bash
# Scaffold the canonical local notes starter
npx @shippie/cli init
npx @shippie/cli deploy ./dist
```

`shippie init` writes the launch-path starter: a phone-first local notes tool using `shippie.local.db.save()` and `shippie.local.db.list()`, with a `data_passport`, safe-area CSS, 16px inputs, and no server setup. Your app is live at `https://your-app.shippie.app`.

Want a no-build zip fixture? Use `templates/local-notes/`: it is a single-file version of the same local-tool pattern for browser upload and smoke tests.

## Option 2: Web upload

1. Go to [shippie.app/new](https://shippie.app/new)
2. Drag your build output (dist/, build/, out/) as a zip, or zip `templates/local-notes/` for the no-build starter
3. Pick a name, slug, and type
4. Click "Ship it"

## Option 3: From Claude Code or Cursor (MCP)

Once the MCP server is wired up in your AI tool, just say:

```
deploy this to Shippie as recipe-saver
```

It reads your project, picks a type, and ships.

To remix an existing public app, ask for the handoff first:

```
remix_info slug=recipe-saver
```

The tool returns the source repo, license, GitHub fork URL when available, and the exact deploy call to preserve lineage:

```
deploy directory=/absolute/path/to/dist slug=recipe-saver-remix remix_from=recipe-saver
```

## Option 4: GitHub (auto-deploy)

1. Install the Shippie GitHub App on your repo
2. Push to `main`
3. Shippie auto-builds and deploys

## Remixing an app

Remix requires a public app whose maker has published source, a license, and remix permission. A GitHub account is only required when you want GitHub fork history or private-repo access; local clone/edit/upload works without GitHub.

Makers opt in from `shippie.json`:

```json
{
  "source_repo": "https://github.com/acme/recipe-saver",
  "license": "MIT",
  "remix_allowed": true
}
```

```bash
# Inspect source, license, fork URL, and redeploy commands
npx @shippie/cli remix recipe-saver

# After cloning or forking and rebuilding your copy
npx @shippie/cli deploy ./dist --slug recipe-saver-remix --remix recipe-saver

# Hosted URL wraps are retired. Convert to local primitives, build, then deploy.
npx @shippie/cli deploy ./dist --slug recipe-saver-web --remix recipe-saver
```

Multi-app workspaces can keep lineage per app:

```json
{
  "apps": [
    {
      "slug": "recipe-saver-remix",
      "directory": "dist",
      "remixFrom": "recipe-saver"
    }
  ]
}
```

## Store data locally

Shippie is not a place to bring a Supabase/Firebase app and call it private. The public
marketplace accepts local tools: no external login, no third-party user-data storage, no
trackers, no ads, and no silent user-data egress.

```ts
import { shippie } from '@shippie/sdk'

await shippie.local.db.save('notes', { id: 'abc', title: 'Hello' })
const notes = await shippie.local.db.list('notes')
await shippie.local.files.write('photo.jpg', photoBlob)
```

If the user wants continuity, use Shippie secure backup. Backup stores sealed copies that
Shippie cannot open; it is not a login system.

```json
{
  "data": {
    "mode": "shippie-documents",
    "documents": ["main"],
    "recovery": "inherited",
    "realtime": "inherited"
  },
  "data_passport": {
    "family": "notes",
    "schema": "notes.v1"
  }
}
```

## What Shippie provides

- Static hosting on `{slug}.shippie.app`
- PWA generation (manifest, service worker, icons)
- Marketplace listing with search and discovery
- Feedback system (comments, bugs, ratings)
- Proof events and aggregate diagnostics
- Local Tool policy scanning on zip, CLI, MCP, trial, and workspace deploys
- Build pipeline (auto-detects Vite, Next.js, Astro, etc.)

## What the scanner blocks

- Hosted user databases and storage clients
- External auth required for core use
- Third-party analytics, tracking pixels, and ad SDKs
- External writes that can carry user content
- Silent external AI calls with user content

Public reference data is allowed when user data is not sent out. For the full rule, see
[`docs/strategy/local-tools-policy.md`](./strategy/local-tools-policy.md).

## Create private spaces

If your app is more useful with a small group, add a `spaces` block to
`shippie.json`. Shippie then gives the deployed app invite links, QR codes,
roles, join-token rotation, archive mode, and Hub discovery without making you
build accounts or a backend.

```json
{
  "spaces": {
    "enabled": true,
    "roles": [
      { "id": "host", "permissions": ["read", "write", "invite", "archive"] },
      { "id": "member", "permissions": ["read", "write"] },
      { "id": "viewer", "permissions": ["read"] }
    ],
    "syncMode": "gossip",
    "archivable": true
  }
}
```

Use this for rooms, classes, trips, household tools, watch parties, fantasy
leagues, and venue experiences. Full guide: [`docs/private-spaces-builder.md`](./private-spaces-builder.md).

## Make it feel like an app

Shippie is one installable PWA. Inside Shippie, your app runs as an iframe. To feel right whether the user is in installed-PWA Shippie, mobile-web Shippie, or desktop-web Shippie, follow this baseline:

| Concern | Use | Don't use |
|---|---|---|
| Full-height layout | `100dvh` (with `100svh` fallback) | `100vh` — leaves a gap when iOS URL bar collapses |
| Fixed positioning | `padding: env(safe-area-inset-*, 0)` | bare `position: fixed` — clips into the home indicator / notch |
| Touch targets | `min-height: 44px` (Apple HIG) / `48dp` (Android) | <40px — frustrating on phones |
| Input fonts | `font-size: 16px` minimum | <16px on iOS — Safari zooms in on focus |
| Corners | `border-radius: 0` (Shippie hallmark) | rounded — clashes with platform brand |
| Touch action | `touch-action: manipulation` on tappables | default — costs ~300ms tap delay on some browsers |
| Pull-to-refresh inside the app | `overscroll-behavior-y: contain` on `body` | unset — bounces Shippie's chrome around |

The deploy pipeline (`apps/platform/.../deploy/pipeline.ts:injectEssentials`) re-injects most of this idempotently — viewport, sharp-corners CSS, iOS standalone metas, `touch-action`, `overscroll-behavior`. **The injection enforces; this checklist teaches.** Writing in this style means your local previews behave like production.

### Cross-context cooperation

The Shippie shell can hide / reposition its chrome when the iOS keyboard rises in your tool — but only if your tool tells it. The SDK exports a one-line helper:

```ts
import { useKeyboard } from '@shippie/sdk'

useKeyboard()  // posts shippie:tool-keyboard-open / -close to the parent shell
```

Origin-safe: the helper computes the parent's origin from `document.referrer` and never posts to `*`. If your tool runs outside Shippie (e.g., previewed standalone), `useKeyboard` becomes a no-op.

Two more situational helpers:

```ts
import { useSafeArea, useViewport, matchesStandalone } from '@shippie/sdk'

const insets   = useSafeArea()      // { top, right, bottom, left } in px
const viewport = useViewport()      // { width, height, dvh, lvh, svh, mode }
const installed = matchesStandalone() // true inside an installed PWA
```

`shippie init` writes a starter `index.html`, `styles.css`, and `main.ts` that wire all four helpers, so a fresh project ships with the pattern in place.
