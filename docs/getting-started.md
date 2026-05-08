# Getting Started with Shippie

Deploy your first app in under 5 minutes. Before you start, pick what you're shipping.

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
# Install the CLI
npx @shippie/cli init
npx @shippie/cli deploy ./dist
```

Your app is live at `https://your-app.shippie.app`.

## Option 2: Web upload

1. Go to [shippie.app/new](https://shippie.app/new)
2. Drag your build output (dist/, build/, out/) as a zip
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

```bash
# Inspect source, license, fork URL, and redeploy commands
npx @shippie/cli remix recipe-saver

# After cloning or forking and rebuilding your copy
npx @shippie/cli deploy ./dist --slug recipe-saver-remix --remix recipe-saver
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

## Adding a backend (optional)

Shippie hosts your frontend. For auth, storage, and files, bring your own backend:

```javascript
import { createClient } from '@supabase/supabase-js'
import { shippie } from '@shippie/sdk'

const supabase = createClient(url, anonKey)
shippie.configure({ backend: 'supabase', client: supabase })

// Now you have auth, storage, and files
await shippie.auth.signIn()
await shippie.db.set('notes', 'abc', { title: 'Hello' })
```

## What Shippie provides

- Static hosting on `{slug}.shippie.app`
- PWA generation (manifest, service worker, icons)
- Marketplace listing with search and discovery
- Feedback system (comments, bugs, ratings)
- Analytics (anonymous event tracking)
- Build pipeline (auto-detects Vite, Next.js, Astro, etc.)

## What you provide (if needed)

- Auth (Supabase Auth, Firebase Auth)
- Database (Supabase Postgres, Firebase Firestore)
- File storage (Supabase Storage, Firebase Storage)

Shippie never touches your users' data.
