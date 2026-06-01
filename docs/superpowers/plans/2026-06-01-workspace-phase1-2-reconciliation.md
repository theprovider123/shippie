# Phase 1+2 ↔ codex WIP — Reconciliation Playbook

**Date:** 2026-06-01 (pre-staged while codex's WIP is still uncommitted)
**Trigger:** Run this the moment codex commits its working-tree WIP (i.e. `review-implementation-2026-05-23` advances past `ed8fc215`, or the 4 files below stop being dirty in the main tree).
**Branch to land:** `workspace-phase1` (Phase 1 + post-review fixes + Phase 2, 17 commits).

## Scope of the collision

`workspace-phase1` branches from `ed8fc215`, which already contains all of codex's *committed* work (origin `b2521014` is an ancestor — 0 origin-only commits). **The only thing to reconcile is codex's uncommitted WIP, which touches exactly 4 files** (243 lines). All my *other* Phase 1/2 files (rail-groups, canvas-strip[+test], CanvasStrip, the `/tools` + `/workspace` + redirect routes, manifest, launch-redirects, you, docs, run, +layout, SearchBar, showcase-catalog.test) have **no overlap** with codex's dirty set — they merge clean.

> Re-diff at execution time (`git diff -- <file>`); the WIP may have shifted. The *structure* below (which files, the move-reapply pattern) is stable.

## Execution

1. Get codex's WIP committed on `review-implementation-2026-05-23` and pushed.
2. In the worktree: `git -C <wt> fetch && git -C <wt> rebase origin/review-implementation-2026-05-23` (or merge). Most files apply clean; resolve the 4 below.
3. `bun run typecheck && bun run test`; expect green (the 19 no-bake failures only appear in a worktree without a full showcase bake — verify on a baked tree).

## Per-file reconciliation

### 1. `apps/platform/scripts/prepare-showcases.mjs` — AUTO, no action
Codex's WIP is in the SDK-runtime builder + `writeFirstPartyCuration` (diff hunks at lines ~13, 38, 61, 77, 571–731). My only change is the shell-assets `routes` array (line ~540: `['/', '/apps']` → `['/workspace', '/tools', '/']`). Disjoint regions → git auto-merges. Confirm the merged `routes` array still reads `['/workspace', '/tools', '/']`.

### 2. `apps/platform/src/routes/+page.server.ts` (root) — RENAME/MODIFY, manual
My branch **moved** this catalog loader to `src/routes/tools/+page.server.ts` and replaced root with a redirect (`redirect(307, /workspace…)`). Codex's WIP edits the *loader*. Git will flag rename/delete-vs-modify. **Resolution: keep my root redirect; apply codex's two edits to `tools/+page.server.ts`:**
- Add import: `import { PUBLIC_FLAGSHIP_SLUGS } from '$lib/_generated/first-party-curation';`
- Replace the hardcoded `LAUNCHER_FEATURED_SLUGS_BY_PHASE` object literal with:
  ```ts
  const LAUNCHER_FEATURED_SLUGS_BY_PHASE: Record<LauncherPhase, readonly string[]> = {
    prelaunch: PUBLIC_FLAGSHIP_SLUGS,
    'world-cup': PUBLIC_FLAGSHIP_SLUGS,
  };
  ```
  (Delete the long prelaunch/world-cup slug arrays + the `satisfies` clause.)

### 3. `apps/platform/src/routes/container/+page.svelte` — RENAME/MODIFY, manual
My branch **moved** the real page to `src/routes/workspace/+page.svelte` and left `container/+page.svelte` as a redirect stub. Codex's WIP edits `normalizeAnalyticsEvent` (~line 2420) — a region untouched by my sidebar/strip/route edits. **Resolution: keep my container stub; apply codex's rename to `workspace/+page.svelte`:** in `normalizeAnalyticsEvent`, the returned object's keys `event` → `event_name` and `props` → `properties` (both in the return *type* and the return *value*; 2 hunks). Verify nothing downstream in `workspace/+page.svelte` still reads `.event`/`.props` off that return.

### 4. `apps/platform/src/routes/__shippie-pwa/sw.js/+server.ts` — MOSTLY AUTO + small manual
Codex's +182 lines are in: 2 top imports (`LAUNCHER_HTML`, `LAUNCHER_SCRIPT` `?raw`), `STATIC_LAUNCHER_HTML/SCRIPT` consts after `KERNEL_URLS`, and the offline-capsule/download/capsule functions + GET handler (hunks at ~256, 313, 332, 546, 1077). My edits are localized: `SHELL_DOCUMENTS` (5-element + comment), `APPS_PREFIX` → `CATALOG_PREFIX = '/tools'` (const + its one usage ~line 1035), `shellKeysForRequest` (+3 `/workspace` push lines), `shellDocumentUrls` (+1 `/workspace` push line). Expect ≤2 small conflicts — the top consts block (my `SHELL_DOCUMENTS` is adjacent to codex's new `STATIC_LAUNCHER` consts) and `shellKeysForRequest` (codex inserts a block just above it). **Resolution: take both sides; re-apply my 4 known edits onto the merged file.** They are (verbatim from `workspace-phase1`):
- `const CATALOG_PREFIX = '/tools';` (replacing `const APPS_PREFIX = '/apps';`)
- `const SHELL_DOCUMENTS = ['/workspace', '/tools', '/you', '/', '/container'];` (with the 3-line comment above it)
- in `shellKeysForRequest`: after the `'/'` push add `if (url.pathname === '/workspace') keys.push(absoluteUrl('/workspace'));`, in the `if (slug)` block add the `/workspace?app=…&focused=1` push, and add `keys.push(absoluteUrl('/workspace'));` before the `/container` push.
- in `shellDocumentUrls`: in the `if (slug)` block add `urls.push('/workspace?app=' + encodeURIComponent(slug) + '&focused=1');`
- the `if (url.pathname.startsWith(CATALOG_PREFIX))` rename + comment at ~line 1035.

## Post-reconcile checks
- `grep -rn "APPS_PREFIX" src` → only the renamed `CATALOG_PREFIX` remains (no stray `APPS_PREFIX`).
- Route smoke (dev server): `/`→307 `/workspace`; `/container`→308 `/workspace`; `/apps`→301 `/tools`; `/workspace`,`/tools`→200; `/run/<slug>` mounts the focused shell.
- `bun run typecheck && bun run test` green on a baked tree; then hand the merge to the user (do not push to the shared branch unprompted).
