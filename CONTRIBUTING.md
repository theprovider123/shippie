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
- **Wrangler** authenticated for Cloudflare preview/deploy flows

### Local setup

```bash
cd apps/platform
bun run db:migrate:local
bun run dev
```

## Project structure

```
shippie/
  apps/platform/     SvelteKit + Cloudflare platform (AGPL)
  apps/shippie-ai/   Local AI iframe surface (AGPL)
  packages/sdk/      Client SDK (MIT)
  packages/cli/      CLI tool (MIT)
  packages/db/       Shared schema helpers
  packages/pwa-injector/  PWA generation
  services/hub/      Venue/local-network hub (AGPL)
```

## Development workflow

1. Create a branch from `main`
2. Make changes
3. Run `bun run typecheck` — all packages must pass
4. Run `bun run test` — tests must pass
5. Open a PR

## Code style

- TypeScript everywhere
- No default exports unless a local framework convention requires it
- Prefer `const` over `let`
- No semicolons (enforced by tooling)
- Tabs for indentation in config files, spaces in source

## License

By contributing, you agree that your contributions will be licensed under the project's respective licenses (AGPL for platform code, MIT for SDK/CLI).
