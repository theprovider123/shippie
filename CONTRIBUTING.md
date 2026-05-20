# Contributing to Shippie

Shippie is open source because local tools should be inspectable, remixable, and improved in public. Contributions are welcome, but production Shippie remains moderated: public PRs do not auto-deploy to `shippie.app`.

## Ways to Contribute

- **Feature ideas:** open a GitHub Discussion or feature request issue with the user problem, the route/tool affected, and screenshots if visual.
- **Bug reports:** open a bug issue with reproduction steps, device/browser, expected behavior, and actual behavior.
- **Docs fixes:** small PRs are welcome.
- **Code PRs:** fork the public repo, branch from `main`, keep the change focused, and include tests or a short manual verification note.
- **Tool proposals:** build a local tool, run the Local Tool scanner, and submit it through Shippie. Marketplace moderation remains separate from code contribution.

## Maker Rules

Marketplace-eligible Shippie tools follow the Local Tool policy:

- no hidden user-data egress,
- no third-party auth required for core use,
- no hosted user database such as Supabase or Firebase,
- no trackers, ad SDKs, or analytics beacons,
- outside connections must be declared and visible.

Read [`docs/strategy/local-tools-policy.md`](docs/strategy/local-tools-policy.md) before submitting deploy or SDK changes.

## Local Setup

```bash
git clone https://github.com/shippie-app/shippie.git
cd shippie
bun install
bun run dev
```

Useful package checks:

```bash
bun run typecheck
bun run test
bun run lint
```

Platform-only checks:

```bash
bun run --filter=@shippie/platform typecheck
bun run --filter=@shippie/platform test
bun run --filter=@shippie/platform audit:local-tools
bun run --filter=@shippie/platform audit:mobile
```

## Pull Request Checklist

- The PR explains the user or maker problem.
- The change is focused; unrelated refactors are avoided.
- Tests are added or updated when behavior changes.
- UI changes include mobile/PWA notes when relevant.
- New network behavior is declared and follows the Local Tool policy.
- New public docs avoid personal details, private paths, credentials, and internal runbooks.

## Production Control

Shippie accepts public contributions, but maintainers decide what ships to the hosted platform. Public PRs run CI only. Production deploys use the private operator workflow and Cloudflare credentials controlled by maintainers.

## Recognition

Accepted contributors may be listed in release notes and can earn a Shippie contributor badge. The badge is recognition, not payment, equity, moderation authority, or guaranteed marketplace placement.

## License

By contributing, you agree that your contributions are licensed under the project's licenses: AGPL-3.0 for the platform and MIT for SDK, CLI, MCP, templates, and reusable packages unless a file states otherwise.
