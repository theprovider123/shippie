# Getting Started with Shippie

Deploy your first local tool in under 5 minutes.

## Pick your app type

Every Shippie project is a local tool: no external login, no hidden data egress, local storage by default. The `type` field tells the launcher how to present it.

| Type | What it is | Best for |
|---|---|---|
| **app** | Phone-first PWA. Installable. Offline-first. | AI micro-tools, habit trackers, capture tools |
| **web_app** | Local workflow with more room. Tabs, URLs, desktop-friendly. | Internal tools, dashboards, authoring tools |
| **website** | Static public surface with Shippie listing. | Docs, landing pages, portfolios |

## Option 1: CLI (recommended)

```bash
npx @shippie/cli init
npx @shippie/cli deploy ./dist
```

`shippie init` scaffolds a phone-first local notes tool using `shippie.local.db.save()` / `shippie.local.db.list()`, with a `data_passport`, safe-area CSS, and 16px inputs. Your app goes live at `https://your-app.shippie.app`.

For a no-build zip fixture, use `templates/local-notes/` or `templates/shippie-starter/` — single-file versions of the same pattern for browser upload and smoke tests.

## Option 2: Web upload

1. Go to [shippie.app/new](https://shippie.app/new)
2. Drag your `dist/`, `build/`, or `out/` folder as a zip (or zip `templates/local-notes/` for the no-build starter)
3. Pick a name, slug, and type
4. Click "Ship it"

## Option 3: From Claude Code or Cursor (MCP)

Once the MCP server is wired up, say:

```
deploy this to Shippie as recipe-saver
```

To remix an existing public app:

```
remix_info slug=recipe-saver
```

Returns source repo, license, fork URL, and the exact deploy call to preserve lineage:

```
deploy directory=/absolute/path/to/dist slug=recipe-saver-remix remix_from=recipe-saver
```

## Option 4: GitHub (auto-deploy)

1. Install the Shippie GitHub App on your repo
2. Push to `main`
3. Shippie auto-builds and deploys

## Store data locally

The public marketplace accepts only local tools: no external login, no third-party user-data storage, no trackers, no ads, no silent data egress.

```ts
import { shippie } from '@shippie/sdk'

await shippie.local.db.save('notes', { id: 'abc', title: 'Hello' })
const notes = await shippie.local.db.list('notes')
await shippie.local.files.write('photo.jpg', photoBlob)
```

For user continuity, use Shippie secure backup. Backup stores sealed copies Shippie cannot open — it is not a login system.

## Remixing an app

Remix requires a public app whose maker has set `remix_allowed: true` in `shippie.json`:

```json
{
  "source_repo": "https://github.com/acme/recipe-saver",
  "license": "MIT",
  "remix_allowed": true
}
```

```bash
npx @shippie/cli remix recipe-saver
npx @shippie/cli deploy ./dist --slug recipe-saver-remix --remix recipe-saver
```

## Layout checklist

Your app runs in an iframe inside the Shippie PWA shell. Follow this baseline so it feels native across installed-PWA, mobile-web, and desktop-web contexts:

| Concern | Use | Avoid |
|---|---|---|
| Full-height layout | `100dvh` (with `100svh` fallback) | `100vh` |
| Fixed positioning | `padding: env(safe-area-inset-*, 0)` | bare `position: fixed` |
| Touch targets | `min-height: 44px` / `48dp` | under 40px |
| Input font size | `16px` minimum | under 16px on iOS |
| Touch action | `touch-action: manipulation` on tappables | default |
| Pull-to-refresh | `overscroll-behavior-y: contain` on `body` | unset |

The deploy pipeline re-injects most of this idempotently.

### SDK helpers

```ts
import { useKeyboard, useSafeArea, useViewport, matchesStandalone } from '@shippie/sdk'

useKeyboard()           // tells the shell when the iOS keyboard is up
const insets = useSafeArea()     // { top, right, bottom, left } in px
const viewport = useViewport()   // { width, height, dvh, lvh, svh, mode }
const installed = matchesStandalone()  // true inside an installed PWA
```

`shippie init` wires all four helpers in the generated starter.

## What Shippie provides

- Static hosting on `{slug}.shippie.app`
- PWA generation (manifest, service worker, icons)
- Marketplace listing with search and discovery
- Feedback system (comments, bugs, ratings)
- Local Tool policy scanning on every deploy path

## What the scanner blocks

- Hosted user databases / storage clients
- External auth required for core use
- Third-party analytics, tracking pixels, ad SDKs
- Silent external AI calls carrying user content

Full rule: `docs/strategy/local-tools-policy.md`.
