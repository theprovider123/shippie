# Architecture

Shippie is a monorepo. The platform is open source under AGPL-3.0; the client-facing packages (SDK, CLI, MCP server, templates) are MIT so you can link into your apps without licensing drag.

## Repo layout

```
apps/web/              Next.js platform — storefront, dashboard, deploy API (AGPL)
packages/sdk/          @shippie/sdk — client SDK for deployed apps (MIT)
packages/cli/          @shippie/cli — terminal deploy tool (MIT)
packages/mcp-server/   @shippie/mcp — MCP server for AI tools (MIT)
packages/db/           Drizzle schema + Postgres migrations
packages/pwa-injector/ PWA manifest + service worker generation
packages/shared/       Shared types (project types, etc.)
services/worker/       Cloudflare Worker — serves *.shippie.app (AGPL)
templates/             Starter templates (MIT)
```

## BYO backend

Shippie hosts your frontend. Auth, storage, and database come from your own Supabase or Firebase. Shippie never touches end-user data.

```javascript
import { createClient } from '@supabase/supabase-js';
import { shippie } from '@shippie/sdk';

const supabase = createClient(url, anonKey);
shippie.configure({ backend: 'supabase', client: supabase });

await shippie.auth.signIn();
await shippie.db.set('notes', 'abc', { title: 'Hello' });
```

Platform features that don't need your backend: feedback, analytics, install tracking, marketplace listing.

## Deploy paths

| Path | How | Target time-to-URL |
|---|---|---|
| **CLI** | `shippie deploy ./dist` | 30s |
| **Web upload** | Drag zip at `shippie.app/new` | 30s |
| **MCP** | "deploy this to Shippie" in Claude Code | 60s |
| **GitHub** | Push to a connected repo | <10s to placeholder, <2min to built |
| **Deploy button** | Click badge in README | same as GitHub |

Live p50/p95 per path lives at [`shippie.app/stats`](https://shippie.app/stats).

## Licensing

- **Platform** (`apps/web`, `services/worker`, `packages/pwa-injector`, `packages/db`): [AGPL-3.0](../LICENSE). Fork and self-host freely; network-accessible modifications must be published under the same license.
- **SDK / CLI / MCP server / shared / templates**: [MIT](../LICENSE-MIT). Link into your apps without constraint.

See [self-hosting](./self-hosting.md) for running your own instance.
