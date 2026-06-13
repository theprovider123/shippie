# Arcade Game Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make arcade cabinet membership admin-controlled at runtime (no platform redeploy), auto-exclude unlisted/suspended games, keep pulled games working standalone, and stop remixes from claiming arcade surface.

**Architecture:** The cabinet keeps its baked curated roster (`apps/showcase-arcade/src/games.ts`) for display + offline fallback, and fetches a live `{enabled, blocked}` filter from a new D1-first `GET /api/arcade/roster`. A shared predicate (`isEnabledInArcade`) drives the endpoint, the conditional `/run/<slug>` redirect, and an admin "In arcade" toggle (`surface` arcade↔archived). A surface guard clamps any non-baked app off `surface='arcade'`. Spec: `docs/superpowers/specs/2026-06-13-arcade-lifecycle-design.md`.

**Tech Stack:** SvelteKit + Cloudflare Workers + D1 (Drizzle) on `apps/platform` (**vitest only**); React + Vite + bun:test on `apps/showcase-arcade`. Green-light = `bun run health` from repo ROOT (`/Users/devante/Documents/Shippie`).

**Branch note:** This is the Codex-collision branch `feat/dock-harmonization`. Stage files **explicitly** (`git add <path>`, never `git add -A`); re-check `git log -1` before each commit; if HEAD moved unexpectedly, surface it. Deploy at the end happens from a clean worktree at HEAD (do not deploy the dirty working tree).

---

## Key facts (verified at HEAD — read before starting)

- **Two different slug sets, do not confuse them:**
  - `ARCADE_GAME_SLUGS` (`apps/platform/src/lib/showcase-slugs.ts`) = the 20 slugs that **alias into** the cabinet (`snake → arcade`). Does **not** include `docklands`.
  - The cabinet **renderable** set = the `id`s in `ARCADE_GAMES` (`apps/showcase-arcade/src/games.ts`) = those 20 **plus `docklands`** (21 total). docklands is renderable but deliberately not aliased (it stays standalone at `/run/docklands`).
  - **The allowlist this plan needs is the renderable set.** All 21 games declare `curation.surface: "arcade"` in their `shippie.json`, and the generated `apps/platform/src/lib/_generated/first-party-curation.ts` already carries per-app `surface`. So derive the allowlist from the generated curation: slugs whose generated `surface === 'arcade'`. This auto-syncs from source manifests.
- **D1 `apps` columns** (`apps/platform/src/lib/server/db/schema/apps.ts`): `slug` (text, unique), `surface` (text, default `'featured'`), `visibilityScope` (text, default `'public'`), `isArchived` (`integer` mode `'boolean'`, default false), `suspendedAt` (text, nullable).
- **`resolveSurface`** (`apps/platform/src/lib/server/deploy/surface-resolver.ts`) returns `{surface, source}`; called twice in `pipeline.ts` (lines ~285 gate, ~357 final). Priority manifest > form > existing > `'featured'`. It **preserves** an existing `surface='arcade'` on redeploy — the guard must clamp its output.
- **`/run/[slug]/+page.server.ts`** redirects via `canonicalShowcaseTarget(params.slug)` **before any DB read**. For `snake`, `canonicalShowcaseTarget('snake').slug === 'arcade'` → 302 to `/run/arcade?game=snake&from=snake`. The conditional check must run **before** that redirect, and only for the 20 aliased arcade slugs.
- **Admin actions** live in `apps/platform/src/routes/admin/+page.server.ts` (`actions: { archive, unarchive, setVisibility }`), each writing `recordAudit` + KV `patchAppMeta`. The `archived → featured` auto-lift is in `setVisibility` (~line 204).
- **`@shippie/sdk` is NOT a dep we add to the cabinet for this**; the cabinet fetches the roster with plain `fetch` (same origin).

---

## File Structure

**`apps/platform` (vitest):**
- Create `src/lib/server/arcade/roster.ts` — `bakedArcadeGameSlugs()`, `arcadeRosterPredicate`, `loadArcadeRoster(db)`, `isEnabledInArcade(db, slug)`. Single source of the predicate.
- Create `src/lib/server/arcade/roster.test.ts`.
- Create `src/routes/api/arcade/roster/+server.ts` — thin GET wrapper.
- Create `src/lib/server/deploy/arcade-surface-guard.ts` — `clampArcadeSurface({slug, resolved})`.
- Create `src/lib/server/deploy/arcade-surface-guard.test.ts`.
- Modify `src/lib/server/deploy/pipeline.ts` — apply the clamp after both `resolveSurface` calls.
- Modify `src/routes/admin/+page.server.ts` — add `setArcade` action; patch `setVisibility` auto-lift to skip baked arcade slugs.
- Modify `src/routes/admin/+page.svelte` — add the "In arcade" toggle control on the app row.
- Modify `src/routes/run/[slug]/+page.server.ts` — conditional standalone-vs-redirect for aliased arcade slugs.
- Create `drizzle/0067_arcade_surface_sweep.sql` — downgrade non-allowlisted `surface='arcade'` rows.

**`apps/showcase-arcade` (bun:test):**
- Create `src/roster.ts` — `fetchRoster()`, `resolveVisibleGames(baked, rosterState)`, localStorage cache, tiered fallback.
- Create `src/roster.test.ts`.
- Modify `src/App.tsx` — fetch roster, filter lanes, deep-link fallback, hide empty lanes.
- Modify `src/games.test.ts` — evolve drift test to the superset direction.

---

## Task 1: Baked arcade allowlist + roster predicate + helpers

**Files:**
- Create: `apps/platform/src/lib/server/arcade/roster.ts`
- Test: `apps/platform/src/lib/server/arcade/roster.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/platform/src/lib/server/arcade/roster.test.ts
import { describe, expect, it } from 'vitest';
import { bakedArcadeGameSlugs, partitionRoster, type ArcadeAppRow } from './roster';

describe('bakedArcadeGameSlugs', () => {
  it('is derived from generated curation surface=arcade and includes docklands but not non-games', () => {
    const slugs = bakedArcadeGameSlugs();
    expect(slugs.has('snake')).toBe(true);
    expect(slugs.has('docklands')).toBe(true);
    expect(slugs.has('palate')).toBe(false);
  });
});

describe('partitionRoster', () => {
  const baked = new Set(['snake', 'crossing', 'docklands']);
  const row = (slug: string, o: Partial<ArcadeAppRow> = {}): ArcadeAppRow => ({
    slug, surface: 'arcade', visibilityScope: 'public', isArchived: false, suspendedAt: null, ...o,
  });

  it('enables only baked, public, arcade-surface, non-suspended, non-archived rows', () => {
    const { enabled } = partitionRoster([row('snake'), row('crossing')], baked);
    expect(enabled).toEqual(['snake', 'crossing']);
  });

  it('excludes a pulled (surface=archived) game from enabled and from blocked', () => {
    const { enabled, blocked } = partitionRoster([row('snake', { surface: 'archived' })], baked);
    expect(enabled).toEqual([]);
    expect(blocked).toEqual([]);
  });

  it('lists a suspended baked game in blocked, not enabled', () => {
    const { enabled, blocked } = partitionRoster([row('snake', { suspendedAt: '2026-06-13T00:00:00Z' })], baked);
    expect(enabled).toEqual([]);
    expect(blocked).toEqual(['snake']);
  });

  it('lists a taken-down (is_archived) baked game in blocked, not enabled', () => {
    const { enabled, blocked } = partitionRoster([row('snake', { isArchived: true })], baked);
    expect(enabled).toEqual([]);
    expect(blocked).toEqual(['snake']);
  });

  it('ignores a surface=arcade row whose slug is not baked (returns it in neither set)', () => {
    const { enabled, blocked } = partitionRoster([row('rogue-remix')], baked);
    expect(enabled).toEqual([]);
    expect(blocked).toEqual([]);
  });

  it('treats a non-public baked arcade game as neither enabled nor blocked', () => {
    const { enabled, blocked } = partitionRoster([row('snake', { visibilityScope: 'unlisted' })], baked);
    expect(enabled).toEqual([]);
    expect(blocked).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd apps/platform && bunx vitest run src/lib/server/arcade/roster.test.ts`
Expected: FAIL — `Cannot find module './roster'`.

- [ ] **Step 3: Implement `roster.ts` (pure parts + DB loaders)**

```ts
// apps/platform/src/lib/server/arcade/roster.ts
import { and, eq, inArray } from 'drizzle-orm';
import type { DrizzleClient } from '$server/db/client';
import { schema } from '$server/db/client';
import { FIRST_PARTY_CURATION } from '$lib/_generated/first-party-curation';

/**
 * The renderable arcade allowlist: first-party games baked with
 * curation.surface='arcade' in their shippie.json (incl. docklands).
 * Derived from generated curation so it auto-syncs with source manifests
 * and never includes a slug the cabinet has no metadata to render.
 */
export function bakedArcadeGameSlugs(): ReadonlySet<string> {
  return new Set(
    FIRST_PARTY_CURATION.filter((e) => e.surface === 'arcade').map((e) => e.slug),
  );
}

export interface ArcadeAppRow {
  slug: string;
  surface: string;
  visibilityScope: string;
  isArchived: boolean;
  suspendedAt: string | null;
}

export interface ArcadeRoster {
  enabled: string[];
  blocked: string[];
}

/** Pure split of D1 rows into the cabinet's enabled + blocked sets. */
export function partitionRoster(
  rows: ArcadeAppRow[],
  baked: ReadonlySet<string>,
): ArcadeRoster {
  const enabled: string[] = [];
  const blocked: string[] = [];
  for (const r of rows) {
    if (!baked.has(r.slug)) continue;            // not renderable → neither set
    const suspendedOrDown = r.suspendedAt !== null || r.isArchived;
    if (suspendedOrDown) {
      blocked.push(r.slug);                       // enforcement → fail-closed
      continue;
    }
    if (r.surface === 'arcade' && r.visibilityScope === 'public') {
      enabled.push(r.slug);                       // curation → on
    }
    // pulled (surface=archived) & still public → neither set
  }
  return { enabled, blocked };
}

/** D1-first roster load. No KV in v1 (stale KV is exactly how leaks happen). */
export async function loadArcadeRoster(db: DrizzleClient): Promise<ArcadeRoster> {
  const baked = bakedArcadeGameSlugs();
  if (baked.size === 0) return { enabled: [], blocked: [] };
  const rows = await db
    .select({
      slug: schema.apps.slug,
      surface: schema.apps.surface,
      visibilityScope: schema.apps.visibilityScope,
      isArchived: schema.apps.isArchived,
      suspendedAt: schema.apps.suspendedAt,
    })
    .from(schema.apps)
    .where(inArray(schema.apps.slug, [...baked]));
  return partitionRoster(rows as ArcadeAppRow[], baked);
}

/** Shared by /run routing and the roster endpoint so they never disagree. */
export async function isEnabledInArcade(db: DrizzleClient, slug: string): Promise<boolean> {
  const baked = bakedArcadeGameSlugs();
  if (!baked.has(slug)) return false;
  const [row] = await db
    .select({
      surface: schema.apps.surface,
      visibilityScope: schema.apps.visibilityScope,
      isArchived: schema.apps.isArchived,
      suspendedAt: schema.apps.suspendedAt,
    })
    .from(schema.apps)
    .where(and(eq(schema.apps.slug, slug)))
    .limit(1);
  if (!row) return false;
  return (
    row.surface === 'arcade' &&
    row.visibilityScope === 'public' &&
    !row.isArchived &&
    row.suspendedAt === null
  );
}
```

(If `DrizzleClient` is not an exported type at `$server/db/client`, use the same type the sibling `slug-availability.ts` imports for its `db` param — match that file's import exactly. `and` is used in `isEnabledInArcade`'s `where`; `eq`/`inArray` are both used — no unused imports.)

- [ ] **Step 4: Run the test, confirm pass**

Run: `cd apps/platform && bunx vitest run src/lib/server/arcade/roster.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/server/arcade/roster.ts apps/platform/src/lib/server/arcade/roster.test.ts
git commit -m "feat(arcade): roster predicate, baked allowlist, isEnabledInArcade helper"
```

---

## Task 2: `GET /api/arcade/roster` endpoint

**Files:**
- Create: `apps/platform/src/routes/api/arcade/roster/+server.ts`
- Test: `apps/platform/src/routes/api/arcade/roster/server.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/platform/src/routes/api/arcade/roster/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { GET } from './+server';

function eventWith(rows: unknown[]) {
  const db = {
    select: () => ({ from: () => ({ where: () => Promise.resolve(rows) }) }),
  };
  return {
    platform: { env: { DB: {} } },
    // getDrizzleClient is mocked below to return `db`
    __db: db,
  } as never;
}

vi.mock('$server/db/client', async (orig) => {
  const actual = await orig<typeof import('$server/db/client')>();
  return { ...actual, getDrizzleClient: (e: { __db?: unknown }) => (globalThis as any).__rosterDb };
});

describe('GET /api/arcade/roster', () => {
  it('returns enabled + blocked + a rev hash', async () => {
    (globalThis as any).__rosterDb = {
      select: () => ({ from: () => ({ where: () => Promise.resolve([
        { slug: 'snake', surface: 'arcade', visibilityScope: 'public', isArchived: false, suspendedAt: null },
      ]) }) }),
    };
    const res = await GET({ platform: { env: { DB: {} } } } as never);
    const body = await res.json();
    expect(body.enabled).toContain('snake');
    expect(Array.isArray(body.blocked)).toBe(true);
    expect(typeof body.rev).toBe('string');
  });

  it('503s with empty sets when DB is unavailable', async () => {
    const res = await GET({ platform: { env: {} } } as never);
    const body = await res.json();
    expect(body.enabled).toEqual([]);
    expect(body.blocked).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd apps/platform && bunx vitest run src/routes/api/arcade/roster/server.test.ts`
Expected: FAIL — `Cannot find module './+server'`.

- [ ] **Step 3: Implement the endpoint**

```ts
// apps/platform/src/routes/api/arcade/roster/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDrizzleClient } from '$server/db/client';
import { loadArcadeRoster } from '$server/arcade/roster';

/** Tiny stable hash so the SW can revalidate cheaply. */
function rev(enabled: string[], blocked: string[]): string {
  const seed = `${enabled.slice().sort().join(',')}|${blocked.slice().sort().join(',')}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export const GET: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB) {
    return json({ enabled: [], blocked: [], rev: '0' }, { status: 503 });
  }
  const db = getDrizzleClient(env.DB);
  const { enabled, blocked } = await loadArcadeRoster(db);
  return json(
    { enabled, blocked, rev: rev(enabled, blocked) },
    { headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' } },
  );
};
```

- [ ] **Step 4: Run the test, confirm pass**

Run: `cd apps/platform && bunx vitest run src/routes/api/arcade/roster/server.test.ts`
Expected: PASS. If the `$server/db/client` mock shape fights vitest, simplify by testing `rev()` + `partitionRoster` directly and asserting the handler returns 503 on missing DB — keep at least the 503 + shape assertions.

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/routes/api/arcade/roster
git commit -m "feat(arcade): GET /api/arcade/roster (D1-first enabled+blocked+rev)"
```

---

## Task 3: Surface guard — clamp non-baked apps off arcade

**Files:**
- Create: `apps/platform/src/lib/server/deploy/arcade-surface-guard.ts`
- Test: `apps/platform/src/lib/server/deploy/arcade-surface-guard.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/platform/src/lib/server/deploy/arcade-surface-guard.test.ts
import { describe, expect, it } from 'vitest';
import { clampArcadeSurface } from './arcade-surface-guard';

describe('clampArcadeSurface', () => {
  it('keeps arcade for a baked slug', () => {
    const r = clampArcadeSurface({ slug: 'snake', surface: 'arcade' });
    expect(r).toEqual({ surface: 'arcade', downgraded: false });
  });

  it('downgrades arcade → featured for a non-baked slug', () => {
    const r = clampArcadeSurface({ slug: 'my-snake-remix', surface: 'arcade' });
    expect(r).toEqual({ surface: 'featured', downgraded: true });
  });

  it('leaves non-arcade surfaces untouched regardless of slug', () => {
    expect(clampArcadeSurface({ slug: 'my-app', surface: 'featured' }).surface).toBe('featured');
    expect(clampArcadeSurface({ slug: 'my-app', surface: 'labs' }).surface).toBe('labs');
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd apps/platform && bunx vitest run src/lib/server/deploy/arcade-surface-guard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the guard**

```ts
// apps/platform/src/lib/server/deploy/arcade-surface-guard.ts
import type { Surface } from '$lib/curation/schema';
import { bakedArcadeGameSlugs } from '$server/arcade/roster';

/**
 * `surface='arcade'` is honored ONLY for baked first-party arcade games.
 * Any other app (maker, remix, unbaked) that resolves to 'arcade' — via
 * manifest, form, OR a preserved existing row — is clamped to 'featured'.
 */
export function clampArcadeSurface(input: { slug: string; surface: Surface }): {
  surface: Surface;
  downgraded: boolean;
} {
  if (input.surface !== 'arcade') return { surface: input.surface, downgraded: false };
  if (bakedArcadeGameSlugs().has(input.slug)) return { surface: 'arcade', downgraded: false };
  return { surface: 'featured', downgraded: true };
}
```

- [ ] **Step 4: Run the test, confirm pass**

Run: `cd apps/platform && bunx vitest run src/lib/server/deploy/arcade-surface-guard.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/platform/src/lib/server/deploy/arcade-surface-guard.ts apps/platform/src/lib/server/deploy/arcade-surface-guard.test.ts
git commit -m "feat(arcade): surface guard clamps non-baked apps off arcade"
```

---

## Task 4: Wire the guard into the deploy pipeline (both resolveSurface call sites)

**Files:**
- Modify: `apps/platform/src/lib/server/deploy/pipeline.ts` (~lines 285 and 357)

- [ ] **Step 1: Read both call sites**

Run: `grep -n "resolveSurface(" apps/platform/src/lib/server/deploy/pipeline.ts`
Expected: two hits (`_gateSurface` ~285, `resolvedSurface` ~357).

- [ ] **Step 2: Import the guard**

At the top of `pipeline.ts`, beside `import { resolveSurface } from './surface-resolver';`:

```ts
import { clampArcadeSurface } from './arcade-surface-guard';
```

- [ ] **Step 3: Clamp the gate-stage surface (~line 285)**

Replace:

```ts
  const _gateSurface = resolveSurface({
    manifestSurface: manifest.curation?.surface,
    formOverride: input.surfaceOverride,
    existingSurface: _existingForGate?.surface,
  });
```

with:

```ts
  const _gateSurface = clampArcadeSurface({
    slug: input.slug,
    surface: resolveSurface({
      manifestSurface: manifest.curation?.surface,
      formOverride: input.surfaceOverride,
      existingSurface: _existingForGate?.surface,
    }).surface,
  });
```

(`_gateSurface` is now `{surface, downgraded}`. Check its downstream use; if it was read as `_gateSurface.surface` already, good; if it was used as the bare object from `resolveSurface`, update those reads to `_gateSurface.surface`.)

- [ ] **Step 4: Clamp the final surface (~line 357) and surface the downgrade flag**

Replace:

```ts
  const resolvedSurface = resolveSurface({
    manifestSurface: manifest.curation?.surface,
    formOverride: input.surfaceOverride,
    existingSurface: appRow?.surface,
  });
```

with:

```ts
  const _resolved = resolveSurface({
    manifestSurface: manifest.curation?.surface,
    formOverride: input.surfaceOverride,
    existingSurface: appRow?.surface,
  });
  const _clamped = clampArcadeSurface({ slug: input.slug, surface: _resolved.surface });
  const resolvedSurface = { surface: _clamped.surface, source: _resolved.source };
  const arcadeSurfaceDowngraded = _clamped.downgraded;
```

Find where `resolvedSurface.surface` is written to D1 and where the deploy result/report object is built; add `surface_downgraded: arcadeSurfaceDowngraded ? 'arcade->featured' : undefined` to the returned report (match the existing report field naming/casing in that object).

- [ ] **Step 5: Verify nothing broke**

Run: `cd apps/platform && bunx vitest run src/lib/server/deploy/` then `bun run typecheck`
Expected: existing deploy/pipeline tests still PASS; typecheck clean. If a pipeline test asserts an arcade surface for a non-baked fixture slug, update the fixture to a baked slug or assert the downgrade — the new behavior is correct.

- [ ] **Step 6: Commit**

```bash
git add apps/platform/src/lib/server/deploy/pipeline.ts
git commit -m "feat(arcade): clamp arcade surface in deploy pipeline (manifest/form/existing)"
```

---

## Task 5: Migration sweep — downgrade existing non-baked arcade rows

**Files:**
- Create: `apps/platform/drizzle/0067_arcade_surface_sweep.sql`

- [ ] **Step 1: Confirm next migration number**

Run: `ls apps/platform/drizzle/*.sql | sort | tail -3`
Expected: highest is `0066_...`. If not, use the actual next number and adjust the filename below.

- [ ] **Step 2: Write the migration**

```sql
-- 2026-06-13 — Surface guard backfill.
--
-- surface='arcade' is now honored only for baked first-party arcade games
-- (apps/showcase-*/shippie.json curation.surface='arcade'). Any other app
-- that currently holds surface='arcade' in D1 (e.g. a maker/remix that
-- self-declared it before the guard existed) is downgraded to 'featured'.
-- The allowlist below mirrors the generated first-party-curation arcade set
-- at authoring time; new arcade games added later are baked and unaffected.

UPDATE apps
SET surface = 'featured', updated_at = datetime('now')
WHERE surface = 'arcade'
  AND slug NOT IN (
    'block-drop','bricks','bulwark','chess','crossing','daily-puzzle',
    'drawing-telephone','drift','five-letter','invaders','lustre','maze',
    'memory-grid','quartet','reaction','snake','stack','sudoku',
    'world-cup-fantasy','would-you-rather','docklands'
  );
```

- [ ] **Step 3: Apply locally + verify**

Run: `cd apps/platform && bun run db:migrate:local`
Expected: `0067_arcade_surface_sweep.sql ✅`.

Run: `cd apps/platform && bunx wrangler d1 execute shippie-platform-d1 --local --json --command "SELECT slug FROM apps WHERE surface='arcade'" | python3 -c "import json,sys; print(sorted(r['slug'] for r in json.load(sys.stdin)[0]['results']))"`
Expected: exactly the 21 baked slugs (no extras).

- [ ] **Step 4: Commit**

```bash
git add apps/platform/drizzle/0067_arcade_surface_sweep.sql
git commit -m "feat(arcade): migration sweep — downgrade non-baked arcade surface rows"
```

---

## Task 6: Admin "In arcade" toggle + archived auto-lift skip

**Files:**
- Modify: `apps/platform/src/routes/admin/+page.server.ts`
- Modify: `apps/platform/src/routes/admin/+page.svelte`
- Test: `apps/platform/src/routes/admin/page.server.test.ts`

- [ ] **Step 1: Write the failing test (auto-lift skip is the load-bearing one)**

Add to `apps/platform/src/routes/admin/page.server.test.ts` (match the file's existing harness for invoking actions; if it tests pure helpers, add a small exported pure helper `shouldAutoLiftArchived(slug, beforeSurface, newVisibility)` and test that):

```ts
import { shouldAutoLiftArchived } from './+page.server';

describe('archived → featured auto-lift', () => {
  it('does NOT auto-lift a baked arcade game (archived = deliberately pulled)', () => {
    expect(shouldAutoLiftArchived('snake', 'archived', 'public')).toBe(false);
  });
  it('auto-lifts a normal archived app published public', () => {
    expect(shouldAutoLiftArchived('some-maker-app', 'archived', 'public')).toBe(true);
  });
  it('never lifts when not publishing public or not archived', () => {
    expect(shouldAutoLiftArchived('some-maker-app', 'featured', 'public')).toBe(false);
    expect(shouldAutoLiftArchived('some-maker-app', 'archived', 'unlisted')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd apps/platform && bunx vitest run src/routes/admin/page.server.test.ts -t "auto-lift"`
Expected: FAIL — `shouldAutoLiftArchived` not exported.

- [ ] **Step 3: Add the helper + patch `setVisibility`**

In `+page.server.ts`, add the exported helper and use it where the auto-lift currently is (~line 204):

```ts
import { bakedArcadeGameSlugs } from '$server/arcade/roster';

export function shouldAutoLiftArchived(
  slug: string,
  beforeSurface: string,
  newVisibility: string,
): boolean {
  if (newVisibility !== 'public' || beforeSurface !== 'archived') return false;
  // Baked arcade games use archived as the deliberate "pulled from cabinet"
  // state; publishing visibility must not silently re-add them.
  if (bakedArcadeGameSlugs().has(slug)) return false;
  return true;
}
```

Replace the inline auto-lift:

```ts
    const newSurface = (visibility === 'public' && before.surface === 'archived') ? 'featured' : undefined;
```

with:

```ts
    const newSurface = shouldAutoLiftArchived(before.slug, before.surface, visibility) ? 'featured' : undefined;
```

- [ ] **Step 4: Add the `setArcade` action**

In the `actions` object in `+page.server.ts`, add (mirror `setVisibility`'s audit + KV pattern):

```ts
  setArcade: async (event) => {
    const admin = requireAdmin(event);
    if (!event.platform?.env.DB) return fail(503, { error: 'database unavailable' });
    const db = getDrizzleClient(event.platform.env.DB);
    const form = await event.request.formData();
    const id = String(form.get('id') ?? '');
    const inArcade = String(form.get('in_arcade') ?? '') === 'true';
    if (!id) return fail(400, { error: 'missing app id' });

    const [before] = await db
      .select({ id: schema.apps.id, slug: schema.apps.slug, surface: schema.apps.surface })
      .from(schema.apps).where(eq(schema.apps.id, id)).limit(1);
    if (!before) return fail(404, { error: 'app not found' });

    if (!bakedArcadeGameSlugs().has(before.slug)) {
      return fail(400, { error: 'not a baked arcade game' });
    }
    const newSurface = inArcade ? 'arcade' : 'archived';
    if (before.surface === newSurface) return { ok: true, noop: true };

    await db.update(schema.apps)
      .set({ surface: newSurface, updatedAt: new Date().toISOString() })
      .where(eq(schema.apps.id, id));

    const cache = event.platform?.env.CACHE;
    if (cache) {
      try { await patchAppMeta(cache, before.slug, { slug: before.slug }); }
      catch (err) { console.error('[admin.setArcade] KV sync failed — reconcile-kv will repair', err); }
    }
    await recordAudit(db, {
      actorUserId: admin.id,
      action: 'admin.app.set_arcade',
      targetTable: 'apps',
      targetId: id,
      before: { surface: before.surface },
      after: { surface: newSurface },
    });
    return { ok: true };
  },
```

(`bakedArcadeGameSlugs` import is added in Step 3. `patchAppMeta`, `recordAudit`, `requireAdmin`, `schema`, `eq`, `getDrizzleClient`, `fail` are already imported in this file — confirm and reuse.)

- [ ] **Step 5: Add the row control in `+page.svelte`**

Find the per-app row where `archive`/`setVisibility` forms render. For rows whose slug is a baked arcade game, add an "In arcade" toggle. Pass the baked set from `load` (add `bakedArcadeSlugs: [...bakedArcadeGameSlugs()]` to the returned data in the page's `load`), then in the row:

```svelte
{#if data.bakedArcadeSlugs.includes(app.slug)}
  <form method="POST" action="?/setArcade" use:enhance>
    <input type="hidden" name="id" value={app.id} />
    <input type="hidden" name="in_arcade" value={app.surface === 'arcade' ? 'false' : 'true'} />
    <button type="submit">{app.surface === 'arcade' ? 'Pull from arcade' : 'Add to arcade'}</button>
  </form>
{/if}
```

(Match the existing row markup/classes; `use:enhance` is already imported on this page if other forms use it.)

- [ ] **Step 6: Run tests + typecheck**

Run: `cd apps/platform && bunx vitest run src/routes/admin/page.server.test.ts && bun run typecheck`
Expected: PASS; clean.

- [ ] **Step 7: Commit**

```bash
git add apps/platform/src/routes/admin/+page.server.ts apps/platform/src/routes/admin/+page.svelte apps/platform/src/routes/admin/page.server.test.ts
git commit -m "feat(arcade): admin 'In arcade' toggle + skip archived auto-lift for baked games"
```

---

## Task 7: Conditional `/run/<slug>` — standalone when pulled

**Files:**
- Modify: `apps/platform/src/routes/run/[slug]/+page.server.ts`

- [ ] **Step 1: Add a pure ordering helper + its test**

Create `apps/platform/src/routes/run/[slug]/arcade-route.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isAliasedArcadeSlug } from './arcade-route';

describe('isAliasedArcadeSlug', () => {
  it('true for an aliased arcade game', () => expect(isAliasedArcadeSlug('snake')).toBe(true));
  it('false for docklands (renderable but not aliased)', () =>
    expect(isAliasedArcadeSlug('docklands')).toBe(false));
  it('false for a normal app', () => expect(isAliasedArcadeSlug('palate')).toBe(false));
});
```

Create `apps/platform/src/routes/run/[slug]/arcade-route.ts`:

```ts
import { ARCADE_GAME_SLUGS } from '$lib/showcase-slugs';

const ALIASED = new Set<string>(ARCADE_GAME_SLUGS);

/** Slugs that alias INTO the cabinet (so their /run redirect is conditional). */
export function isAliasedArcadeSlug(slug: string): boolean {
  return ALIASED.has(slug);
}
```

Run: `cd apps/platform && bunx vitest run src/routes/run/[slug]/arcade-route.test.ts` → PASS.

- [ ] **Step 2: Reorder the load to check membership before the alias redirect**

In `+page.server.ts`, add imports:

```ts
import { isEnabledInArcade } from '$server/arcade/roster';
import { isAliasedArcadeSlug } from './arcade-route';
```

Immediately **before** the existing `const canonical = canonicalShowcaseTarget(params.slug);` block, insert:

```ts
  // Conditional arcade alias: an aliased arcade game redirects INTO the
  // cabinet only while it's enabled. Once pulled, serve it standalone
  // (do not apply the snake→arcade alias redirect below).
  if (platform?.env.DB && isAliasedArcadeSlug(params.slug)) {
    const db = getDrizzleClient(platform.env.DB);
    const enabled = await isEnabledInArcade(db, params.slug);
    if (!enabled) {
      setHeaders({ 'cache-control': 'no-store' });
      depends('app:apps');
      const containerData = await loadContainerPageData({
        platform,
        url,
        requestedAppSlug: params.slug, // its OWN slug, NOT containerSlugForRequest (which would re-alias to 'arcade')
        focused: true,
      });
      return { ...containerData, origin: url.origin };
    }
    // enabled → fall through to the normal canonical redirect into the cabinet
  }
```

Leave the rest of the load unchanged.

- [ ] **Step 3: Verify build + a manual redirect check**

Run: `cd apps/platform && bun run typecheck` → clean.

Run (after `bun run db:migrate:local`): start a local preview later in QA; for now assert logic via the unit test. Add a focused note to the QA phase: with `snake` enabled, `/run/snake` 302s to `/run/arcade?game=snake`; after `setArcade in_arcade=false`, `/run/snake` renders snake standalone (no 302).

- [ ] **Step 4: Commit**

```bash
git add apps/platform/src/routes/run/[slug]/+page.server.ts apps/platform/src/routes/run/[slug]/arcade-route.ts apps/platform/src/routes/run/[slug]/arcade-route.test.ts
git commit -m "feat(arcade): /run/<game> serves standalone when pulled, redirects when enabled"
```

---

## Task 8: Cabinet roster client — fetch, tiered fallback, cache

**Files:**
- Create: `apps/showcase-arcade/src/roster.ts`
- Test: `apps/showcase-arcade/src/roster.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/showcase-arcade/src/roster.test.ts
import { describe, expect, test } from 'bun:test';
import { resolveVisibleIds, type RosterState } from './roster';

const baked = ['snake', 'crossing', 'docklands', 'chess'];

describe('resolveVisibleIds', () => {
  test('live: baked ∩ enabled − blocked', () => {
    const r: RosterState = { kind: 'live', enabled: ['snake', 'crossing', 'chess'], blocked: ['chess'] };
    expect(resolveVisibleIds(baked, r)).toEqual(['snake', 'crossing']);
  });

  test('cached fallback behaves like live (suspended stays gone offline)', () => {
    const r: RosterState = { kind: 'cached', enabled: ['snake'], blocked: ['crossing'] };
    expect(resolveVisibleIds(baked, r)).toEqual(['snake']);
  });

  test('cold fallback fails OPEN on curation but still subtracts baked blocklist', () => {
    const r: RosterState = { kind: 'cold', enabled: [], blocked: [] };
    expect(resolveVisibleIds(baked, r)).toEqual(baked); // full baked roster
  });

  test('cold fallback with a baked blocklist removes blocked', () => {
    const r: RosterState = { kind: 'cold', enabled: [], blocked: ['chess'] };
    expect(resolveVisibleIds(baked, r)).toEqual(['snake', 'crossing', 'docklands']);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd apps/showcase-arcade && bun test src/roster.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `roster.ts`**

```ts
// apps/showcase-arcade/src/roster.ts
export interface RosterState {
  kind: 'live' | 'cached' | 'cold';
  enabled: string[];
  blocked: string[];
}

const CACHE_KEY = 'shippie:arcade:roster:v1';

/** Render set: cold fails open on curation; blocked is always subtracted. */
export function resolveVisibleIds(bakedIds: string[], state: RosterState): string[] {
  const blocked = new Set(state.blocked);
  if (state.kind === 'cold') {
    return bakedIds.filter((id) => !blocked.has(id));
  }
  const enabled = new Set(state.enabled);
  return bakedIds.filter((id) => enabled.has(id) && !blocked.has(id));
}

function readCache(): RosterState | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { enabled?: string[]; blocked?: string[] };
    if (!Array.isArray(p.enabled) || !Array.isArray(p.blocked)) return null;
    return { kind: 'cached', enabled: p.enabled, blocked: p.blocked };
  } catch {
    return null;
  }
}

function writeCache(enabled: string[], blocked: string[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ enabled, blocked }));
    }
  } catch {
    /* storage may be blocked */
  }
}

/** Live fetch → cache; on failure → last-known cache; else cold. */
export async function fetchRoster(origin = ''): Promise<RosterState> {
  try {
    const res = await fetch(`${origin}/api/arcade/roster`, { credentials: 'omit' });
    if (!res.ok) throw new Error(`roster ${res.status}`);
    const body = (await res.json()) as { enabled?: string[]; blocked?: string[] };
    const enabled = Array.isArray(body.enabled) ? body.enabled : [];
    const blocked = Array.isArray(body.blocked) ? body.blocked : [];
    writeCache(enabled, blocked);
    return { kind: 'live', enabled, blocked };
  } catch {
    return readCache() ?? { kind: 'cold', enabled: [], blocked: [] };
  }
}
```

- [ ] **Step 4: Run the test, confirm pass**

Run: `cd apps/showcase-arcade && bun test src/roster.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/showcase-arcade/src/roster.ts apps/showcase-arcade/src/roster.test.ts
git commit -m "feat(arcade): cabinet roster client with tiered offline fallback"
```

---

## Task 9: Cabinet App integration — filter lanes, deep-link fallback, hide empty lanes

**Files:**
- Modify: `apps/showcase-arcade/src/App.tsx`

- [ ] **Step 1: Add roster state + fetch on mount**

Near the other `useState` hooks in `App()`:

```tsx
import { fetchRoster, resolveVisibleIds, type RosterState } from './roster';
import { ARCADE_GAMES } from './games';
```

```tsx
  const [roster, setRoster] = useState<RosterState>({ kind: 'cold', enabled: [], blocked: [] });
```

In an effect that runs on mount and on `visibilitychange → visible`:

```tsx
  useEffect(() => {
    let active = true;
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    const load = () => { void fetchRoster(origin).then((r) => { if (active) setRoster(r); }); };
    load();
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { active = false; document.removeEventListener('visibilitychange', onVis); };
  }, []);
```

- [ ] **Step 2: Compute the visible game set**

```tsx
  const bakedIds = useMemo(() => ARCADE_GAMES.map((g) => g.id), []);
  const visibleIds = useMemo(() => new Set(resolveVisibleIds(bakedIds, roster)), [bakedIds, roster]);
```

- [ ] **Step 3: Filter lanes + hide empty ones**

Where lanes render via `gamesForLane(lane.id)`, filter to visible and drop empty lanes:

```tsx
  {ARCADE_LANES.map((lane) => {
    const games = gamesForLane(lane.id).filter((g) => visibleIds.has(g.id));
    if (games.length === 0) return null;
    return (
      // ...existing lane markup, mapping over `games` instead of gamesForLane(lane.id)
    );
  })}
```

Apply the same `visibleIds` filter to the quick-slots list (`ARCADE_GAMES.slice(0, 8)` → filter to visible first).

- [ ] **Step 4: Deep-link fallback for a pulled/blocked game**

When the selected game isn't visible, fall back to the first visible game with a quiet note. After `selected` is computed:

```tsx
  const selectedHidden = !visibleIds.has(selected.id) && roster.kind !== 'cold';
  useEffect(() => {
    if (selectedHidden) {
      const firstVisible = ARCADE_GAMES.find((g) => visibleIds.has(g.id));
      if (firstVisible && firstVisible.id !== selected.id) selectGame(firstVisible.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHidden]);
```

Render a small inline note (reuse the existing `screen-status` styling or a new `.cabinet-note`) reading **"that one isn't in the cabinet right now"** when a deep link was redirected. (Keep copy lowercase to match the cabinet voice; no modal.)

- [ ] **Step 5: Verify**

Run: `cd apps/showcase-arcade && bun run typecheck && bun test src/ && bun run build`
Expected: all green. Manually: with roster `cold` (offline), all baked games show (fail-open).

- [ ] **Step 6: Commit**

```bash
git add apps/showcase-arcade/src/App.tsx
git commit -m "feat(arcade): cabinet filters to live roster, hides empty lanes, deep-link fallback"
```

---

## Task 10: Evolve the drift test

**Files:**
- Modify: `apps/showcase-arcade/src/games.test.ts`

- [ ] **Step 1: Replace the surface=arcade coverage test with the superset direction**

The current test asserts "every `surface:'arcade'` showcase dir is in `ARCADE_GAMES`." Keep that direction (baked ⊇ all source arcade games) — it already guarantees the offline fallback is complete and that the platform-derived allowlist (`first-party-curation` arcade set) is renderable. Confirm it still passes and tighten the failure message:

```ts
  test('baked ARCADE_GAMES ⊇ every showcase with curation.surface=arcade (offline fallback + allowlist completeness)', () => {
    // ...existing body that reads shippie.json files for surface==='arcade'
    // and asserts each such slug is in ARCADE_GAMES ids...
    expect(missing, `surface=arcade games missing from ARCADE_GAMES (cabinet can't render + platform allowlist would point at nothing): ${missing.join(', ')}`).toEqual([]);
  });
```

- [ ] **Step 2: Run**

Run: `cd apps/showcase-arcade && bun test src/games.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/showcase-arcade/src/games.test.ts
git commit -m "test(arcade): drift test message reflects allowlist completeness"
```

---

## Task 11: Full health + integration QA

- [ ] **Step 1: Repo health**

Run (repo root): `bun run health`
Expected: typecheck + all tests + build green (117 packages). Fix any fallout in the files this plan touched.

- [ ] **Step 2: Integration smoke (local preview)**

```bash
cd apps/platform && bun run db:migrate:local
bun run preview   # http://localhost:8787
```

Verify with curl/browser:
- `GET /api/arcade/roster` → JSON with `enabled` containing `snake`, `docklands`, etc., `blocked: []`, a `rev` string.
- `/run/snake` → 302 to `/run/arcade?game=snake` (enabled).
- Admin → an arcade game row shows "Pull from arcade"; pulling it (sets `surface='archived'`):
  - `GET /api/arcade/roster` no longer lists it in `enabled`.
  - `/run/<that-slug>` now renders standalone (no 302 into the cabinet).
  - The cabinet (`/run/arcade`) no longer shows it; its lane hides if it was the last game.
- Re-add it → back in roster, `/run/<slug>` 302s into the cabinet again.
- A non-baked app cannot be added to arcade (admin action returns `not a baked arcade game`); deploying a fixture app with `curation.surface:'arcade'` resolves to `featured` with the downgrade flag.

- [ ] **Step 3: Commit any QA fixes, then hand off to deploy**

```bash
git add <fixed paths>
git commit -m "fix(arcade): QA fixes from lifecycle integration pass"
```

---

## Deploy (separate, after review)

Deploy from a **clean worktree at HEAD** (the working tree is a Codex-collision branch):

```bash
cd /Users/devante/Documents/Shippie
git worktree add /tmp/arcade-deploy $(git rev-parse HEAD)
cd /tmp/arcade-deploy && bun install && bun run health   # must be green
cd apps/platform && bun run db:migrate    # applies 0067 to prod (forward-only)
bun run deploy
```

Verify in prod: `GET https://shippie.app/api/arcade/roster` returns the enabled set; `/run/snake` 302s into the cabinet; pulling a game via admin removes it live (no redeploy). Remove the worktree (`git worktree remove /tmp/arcade-deploy --force`).

---

## Self-review notes (gaps checked against the spec)

- Spec "enabled predicate (baked allowlist + public + not suspended/archived)" → Task 1 `partitionRoster` / `isEnabledInArcade`. ✓
- Spec "blocked = suspended/takedown, applied offline" → Task 1 (`blocked`), Task 8 (`resolveVisibleIds` always subtracts blocked). ✓
- Spec "D1-first, no KV v1" → Task 1 `loadArcadeRoster` reads D1 only; Task 2 endpoint. ✓
- Spec "surface guard clamps manifest/form/existing + sweep" → Task 3 + Task 4 (both call sites) + Task 5 (sweep). ✓
- Spec "archived auto-lift skips baked arcade slugs" → Task 6 `shouldAutoLiftArchived`. ✓
- Spec "routing order: check before canonical arcade-alias redirect; only aliased slugs; serve own slug not re-aliased" → Task 7. ✓
- Spec "tiered offline fallback (live → cached → cold)" → Task 8 `fetchRoster` + `resolveVisibleIds`. ✓
- Spec "deep-link fallback, hide empty lanes" → Task 9. ✓
- Spec "drift test superset" → Task 10. ✓
- Spec "ARCADE_GAME_SLUGS vs renderable set reconciliation (docklands)" → handled: allowlist derives from generated curation arcade set (includes docklands); only the conditional-redirect uses `ARCADE_GAME_SLUGS` (the aliased subset), which is correct since docklands is never aliased. ✓
