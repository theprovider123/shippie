# Shippie — Claude project notes

These are the load-bearing facts and invariants future sessions need to know up front. Anything ambiguous, **read `docs/CURRENT_STATE.md`** — that's the living truth file, kept fresh on every session-end.

## What Shippie is

Post-cloud app platform. Public story: **Wrap. Run. Connect.** Internal architecture has nine components (Shell, Boost, Sense, Core, AI, Vault, Pulse, Spark, Hub) with a cross-cutting **Proof** principle.

Approved umbrella plan lives at `/Users/devante/.claude/plans/review-all-of-this-swift-token.md`. Don't re-plan unless the user explicitly asks for a re-plan.

## Stack — Cloudflare-only

- Platform app: SvelteKit + Cloudflare Workers + D1 + R2 + KV + Durable Objects (`apps/platform/`)
- AI iframe: Vite + Workbox at `ai.shippie.app` (`apps/shippie-ai/`)
- Hub (venue device): Bun + Docker (`services/hub/`)
- Showcases: Vite + React (`apps/showcase-{recipe,journal,whiteboard,live-room}/`)

Current infrastructure is Cloudflare-first. Keep platform work on Workers, D1, R2, KV, Durable Objects, scheduled triggers, and Cloudflare Email unless the user explicitly opens a new architecture discussion. The `project_cloudflare_only` auto-memory entry covers this.

## Health — `bun run health`

This is the single green-light command. It runs:

```
bun run typecheck && bun run test && bun run build
```

Green = baseline acceptable. As of 2026-04-26: 26/26 typecheck, 31/31 test (33 platform files / 254 tests + 18 SDK & proximity), 24/24 build.

## Test runner invariants

- **`apps/platform` uses `vitest` only.** Never re-introduce `bun:test` imports under `apps/platform/`. The migration was painful (14 files) — don't undo it.
- Most other packages (`packages/sdk`, `packages/proximity`, `packages/local-db`, etc.) use `bun:test` and that's fine.
- The cron dispatcher uses `vi.fn()` for handler injection — the dispatcher's tests are vitest, not bun:test, despite what older commits show.

## Workspace export pattern

Internal packages expose `exports.types` and `exports.import` as `./src/index.ts`, **not** `./dist/...`. Source resolution is immune to `tsup --clean` races during parallel typecheck/build. If you find a package still pointing at `dist`, it's an outlier — bring it in line with `local-db`, `ambient`, `backup-providers`, `intelligence`, `proximity`.

## Showcase kit (`@shippie/showcase-kit-v2`)

`packages/showcase-kit-v2` holds six shared showcase primitives — `EmptyState`, `OnboardingFlow`, `IntentToastHost`, `QrShareSheet`, `BackupCard`, `KeepsakeRenderer`. The four flagship showcases (`showcase-{chiwit,recipe,match-room,world-cup-fantasy}`) integrate it.

**Invariant — the kit ships zero CSS.** It's logic-only by design: every app paints the `shippie-*` classes (`.shippie-onboarding`, `.shippie-intent-toast`, `.shippie-qr-sheet`, `.shippie-backup-card`, `.shippie-empty-state`) in its own palette inside its `styles.css`. An app that imports the kit without writing that skin block (~56 rules) ships visibly-broken unstyled components. `showcase-chiwit/src/styles.css` is the reference skin. If you add the kit to a new showcase, the skin block is a required deliverable, not optional.

## Where things live

| What | Where |
|---|---|
| Living truth file | `docs/CURRENT_STATE.md` |
| Architecture | `docs/architecture.md` (+ `docs/architecture.svg`) |
| Self-hosting | `docs/self-hosting.md` |
| Whitepaper draft v0 | `docs/WHITEPAPER.md` |
| Outstanding actions | `docs/OUTSTANDING_ACTIONS.md` |
| Launch playbooks | `docs/launch/{real-phone-checklist,cf-google-deploy}.md` |
| Active build roadmap | `docs/superpowers/plans/2026-04-25-intelligence-layer-roadmap.md` |
| Production deploy runbook | `docs/superpowers/plans/2026-04-26-prod-deploy-runbook.md` |
| Approved umbrella plan | `/Users/devante/.claude/plans/review-all-of-this-swift-token.md` |

## Rules carried forward from prior sessions

- **Plan-from-HEAD, not memory.** Before writing any plan claim about code state, read the actual file at HEAD. Subagent reports are leads, not oracles.
- **Verify operational claims against HEAD.** Architectural designs ≠ working end-to-end. Before "it works in prod" / "mostly built", open the file. Cite TODO comments as disqualifiers.
- **Commits to main need explicit authorization.** "Wrap up" / "end session" don't authorize commits. Stage + explain; let the user commit.
- **Phase 6 stays deferred.** Spark phone-to-phone propagation, BLE beacon, multi-Hub stadium mesh, MCP-deploy-from-chat polish, native graduation — none of these get touched until launch generates demand signals.

## Bash gotchas

- `bun run X 2>&1 | tail -N` returns `tail`'s exit code, not `bun`'s. For "is the command green?" checks, capture full output to a file then grep for failure markers separately, or use `set -o pipefail`. An "exit 0" task notification can mask a real failure.

## Dev environment gotchas

- **`/apps` 500s on a fresh checkout** until you run `bun run db:migrate:local` from `apps/platform/`. The marketplace SSR query needs the D1 schema + showcase seeds (migrations `0001` through `0022`). The homepage tolerates the empty table; `/apps` doesn't.
- **`bunx wrangler deploy` after `prepare-showcases.mjs` is a no-op for assets unless you `bun run build` in between.** SvelteKit's `static/` only flows into `.svelte-kit/cloudflare/` via the build step. The deploy log is honest ("No updated asset files to upload") but it's easy to misread as "nothing changed in source." Always: generator → build → deploy.
- **`prepare-showcases.mjs` does not clean orphan `static/run/<slug>/` dirs** when a showcase source disappears. After stub consolidation those orphan bakes survive in the worker's asset bundle, get served by the wrapper auto-bridge, and create ghost subdomains for retired apps. Either rm them by hand when retiring, or eventually teach the script to diff source vs. baked dirs.
- **`bun run new:showcase` is STALE — do not use it.** The generator (`apps/platform/scripts/new-showcase.mjs`) targets an old `export const curatedApps` array literal with an obsolete entry shape (`id/entry/labelKind/packageHash/standaloneUrl/devUrl`). The live registry is `const curatedAppSpecs: CuratedAppSpec[]` (short shape: `slug/name/shortName/description/appKind/icon/accent/category/port/intents`), mapped through `curatedApp()`. Running the generator inserts a malformed entry at the wrong `];` and corrupts `state.ts`. Register new showcases by hand: copy `templates/showcase-template/`, append a `curatedAppSpecs` entry (next free port), declare intents in both `state.ts` and `shippie.json`, whitelist any orphan providers in `intent-graph.test.ts`, and add a `drizzle/00NN_seed_showcase_<slug>.sql`. A full `bun run prepare:showcases` (not `prepare:generated`) is needed to bake the new app into the catalog — `generated-only` skips un-baked apps, so the catalog-drift test stays red until a full bake.

## What's outstanding (user-side, not code)

1. Walk through `docs/launch/cf-google-deploy.md` — create CF resources, set secrets, register Google OAuth client.
2. Walk through `docs/launch/real-phone-checklist.md` on iPhone Safari + Android Chrome.
3. Whitepaper polish + launch sequence.
