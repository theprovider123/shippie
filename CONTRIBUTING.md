# Contributing to Shippie

Thanks for wanting to contribute. Shippie is open source (AGPL platform, MIT SDK/CLI) and welcomes contributions of all kinds.

## Getting started

```bash
git clone https://github.com/shippie/shippie.git
cd shippie
bun install
bun run dev          # starts all dev servers via turbo
```

### Prerequisites

- **Bun** 1.3+ (package manager + runtime)
- **Postgres 16** (local dev — `brew install postgresql@16` on macOS)
- **Node.js 20+** (for Next.js dev server)

### Database setup

```bash
createdb shippie_dev
cd packages/db && DATABASE_URL=postgresql://localhost/shippie_dev bun run db:push
```

## Project structure

```
shippie/
  apps/web/          Next.js platform (AGPL)
  packages/sdk/      Client SDK (MIT)
  packages/cli/      CLI tool (MIT)
  packages/db/       Drizzle schema + migrations
  packages/pwa-injector/  PWA generation
  services/worker/   Cloudflare Worker runtime (AGPL)
```

## Development workflow

1. Create a branch from `main`
2. Make changes
3. Run `bun run typecheck` — all packages must pass
4. Run `bun run test` — tests must pass
5. Open a PR

## Code style

- TypeScript everywhere
- No default exports (except Next.js pages)
- Prefer `const` over `let`
- No semicolons (enforced by tooling)
- Tabs for indentation in config files, spaces in source

## License

By contributing, you agree that your contributions will be licensed under the project's respective licenses (AGPL for platform code, MIT for SDK/CLI).
