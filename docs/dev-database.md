# Dev Database

Shippie now uses Cloudflare D1 for platform data. Local development uses the
platform app's local D1 database and migrations, so contributors do not need a
separate database server.

## Fresh Machine

```bash
cd apps/platform
bun run db:migrate:local
bun run dev
```

The dev server runs on `http://localhost:4101`. Magic-link sign-in prints the
link to the terminal unless a Cloudflare Email binding is available.

## Production

Production data lives in the `shippie-platform-d1` Cloudflare D1 database bound
as `DB` in `apps/platform/wrangler.toml`. Scheduled maintenance, rollups, and
retention run through Cloudflare scheduled triggers in the same Worker.
