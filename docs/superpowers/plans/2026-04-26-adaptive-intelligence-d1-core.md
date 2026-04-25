# Adaptive Intelligence — Core (D1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `shippie.local.intelligence.{patterns,temporalContext,recall}` return real data derived from local behaviour. Apps can ask "what does the user typically do at this time?", "what's their typical session shape?", and "show me what they viewed last week that's similar to this query" — all on-device.

**Architecture:** A new `packages/intelligence` package owns three subsystems. (1) An event source subscribes to wrapper-emitted page-view + interaction events and writes them to IndexedDB. (2) A pattern tracker computes rolled-up summaries (typical sessions, frequent navigation paths, peak usage time) on demand. (3) Recall maintains an embedded activity log — page views + brief content snapshots — and answers queries by computing the query embedding via the Shippie AI app's `embed` task, then cosine-similarity over the local index. Temporal context is a thin function over the pattern store.

**Tech Stack:** TypeScript, IndexedDB (already-vendored fake-indexeddb pattern in test), bun:test + happy-dom, the existing `@shippie/sdk` AI bridge for embeddings.

**Hard prerequisites:** Plan A merged (the SDK's `embed` returns `{embedding, source}`). Plan C merged (the wrapper bootstrap is the integration surface for event subscription).

---

## File Structure

**New package:**
- `packages/intelligence/{package.json,tsconfig.json,src/bun-test.d.ts}`
- `src/types.ts` — `PageView`, `InteractionEvent`, `PatternsRollup`, `TemporalContext`, `RecallHit`
- `src/storage.ts` — IndexedDB read/write of events + embeddings
- `src/event-source.ts` — subscribe to wrapper events; debounce-flush
- `src/pattern-tracker.ts` — `patterns()` rollup
- `src/temporal-context.ts` — `temporalContext()` deriver
- `src/recall.ts` — embed + cosine search
- `src/index.ts` — public façade
- Test files for each

**Modified:**
- `packages/sdk/src/wrapper/index.ts` — emit `shippie:pageview` + `shippie:interaction` CustomEvents from observer init
- `packages/sdk/src/local.ts` — add `intelligence` getter that lazy-imports `@shippie/intelligence`
- `apps/showcase-journal/src/pages/Recall.tsx` (new) — demo: "what did I write about last week?"

---

## Task 1: Scaffold + types

- [ ] **Step 1: Mirror `packages/cf-storage` for the workspace shell.** `package.json` name `@shippie/intelligence`. Add `fake-indexeddb` to devDependencies. Copy the `bun-test.d.ts` shim from cf-storage.

- [ ] **Step 2: Write `src/types.ts`:**

```typescript
export interface PageView {
  /** Path within the app, no origin. */
  path: string;
  /** Wall-clock ms when the view started. */
  ts: number;
  /** ms spent on the page before navigating away (set on navigate-away). */
  durationMs?: number;
  /** Optional brief excerpt of visible content for recall. */
  excerpt?: string;
}

export interface InteractionEvent {
  ts: number;
  /** Coarse target descriptor: 'button#new-recipe', 'a[href="/recipes/123"]', etc. */
  target: string;
  kind: 'click' | 'submit' | 'scroll' | 'invalid';
}

export interface SessionSlice {
  start: number;
  end: number;
  pages: string[];
  primaryAction?: string;
}

export interface PatternsRollup {
  /** Last N=200 page views, normalised. */
  recentViews: number;
  typicalSessions: SessionSlice[];
  frequentPaths: string[][]; // sequences like ['/', '/recipes', '/recipes/:id']
  preferences: {
    mostVisitedPath: string | null;
    averageSessionDurationMs: number;
    peakUsageHour: number | null;
  };
}

export interface TemporalContext {
  timeOfDay: 'early-morning' | 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  /** Median session duration for this time-of-day bucket, in ms. */
  expectedSessionDurationMs: number;
  /** 'short' | 'medium' | 'extended' based on the median. */
  availableTime: 'short' | 'medium' | 'extended';
}

export interface RecallHit {
  path: string;
  viewedAt: number;
  durationMs: number;
  /** Cosine similarity in [-1, 1]. */
  relevance: number;
  /** Truncated content excerpt that was indexed. */
  excerpt: string;
}
```

- [ ] **Step 3: Stub `src/index.ts`:**

```typescript
export type * from './types.ts';
export { startTracking, stopTracking } from './event-source.ts';
export { patterns } from './pattern-tracker.ts';
export { temporalContext } from './temporal-context.ts';
export { recall, type RecallOptions } from './recall.ts';
```

- [ ] **Step 4:** `bun install` from root, `cd packages/intelligence && bun run typecheck` → 0 errors. Commit.

---

## Task 2: Storage layer (IndexedDB)

**Files:** `src/storage.ts` + test.

- [ ] **Step 1: Tests** for `appendPageView`, `appendInteraction`, `listPageViews({since,limit})`, `appendEmbedding(viewId, vec)`, `listEmbeddings()`, plus a cap (LOG_CAP=10_000) and prune. Use `fake-indexeddb/auto`.

- [ ] **Step 2: Implementation** — single DB `shippie-intelligence` with three stores: `pageviews` (auto id, indexed by `ts`), `interactions` (auto id, indexed by `ts`), `embeddings` (key=viewId, value=Float32Array). Reuse the open-once + close-on-reset pattern from `packages/sdk/src/wrapper/patina/storage.ts` (await deleteDatabase in `_resetForTest`).

- [ ] **Step 3:** Run, pass, commit.

---

## Task 3: Event source

**Files:** `src/event-source.ts` + test.

- [ ] **Step 1: Tests** — synthesize `CustomEvent('shippie:pageview', {detail: {path, excerpt}})` on a fake window, verify storage receives a record after debounce. Same for interactions.

- [ ] **Step 2: Implementation** — `startTracking(opts?: {window?: Window})` attaches one listener per event type, batches writes through a 250ms debounce so a flurry of clicks doesn't hammer IndexedDB. Returns `stop()` teardown.

- [ ] **Step 3: Modify `packages/sdk/src/wrapper/observe-init.ts`** — after `installPatina()`, dispatch `shippie:pageview` on initial load and on subsequent History API navigations (`pushState` patch). Document the patch carefully — it's a known pattern but worth a comment explaining the contract.

- [ ] **Step 4:** Commit.

---

## Task 4: Pattern tracker

**Files:** `src/pattern-tracker.ts` + test.

- [ ] **Step 1: Tests** — seed storage with synthetic page views (Mon 18:00 = recipe browsing, Sat 19:00 = cooking), call `patterns()`, assert `typicalSessions[0].primaryAction === 'cooking'` etc.

- [ ] **Step 2: Implementation** —
  - Bucket page views into sessions (a session ends when there's >5 minutes of inactivity).
  - For each session, primary action = the path with the longest cumulative dwell.
  - Frequent paths = N-gram of consecutive visits (top 5 sequences of length 3+).
  - Peak usage hour = histogram of view start hours, mode wins.

```typescript
export async function patterns(): Promise<PatternsRollup> {
  const views = await listPageViews({ since: daysAgo(30), limit: 5000 });
  const sessions = bucketSessions(views, 5 * 60 * 1000);
  return {
    recentViews: views.length,
    typicalSessions: rolledTypical(sessions),
    frequentPaths: topNgrams(sessions.map((s) => s.pages), 3, 5),
    preferences: derivePreferences(views, sessions),
  };
}
```

- [ ] **Step 3:** Commit.

---

## Task 5: Temporal context

**Files:** `src/temporal-context.ts` + test.

- [ ] **Step 1: Tests** — seed storage with sessions clustered at evenings; call `temporalContext({now: aThursdayEvening})`, assert `availableTime === 'extended'` if median is >20min.

- [ ] **Step 2: Implementation** — derive `timeOfDay` from hour (5-9 early-morning, 9-12 morning, 12-17 afternoon, 17-21 evening, 21-5 night). `dayOfWeek` from `Date#getDay`. `expectedSessionDurationMs` = median of past sessions in the same time-of-day bucket. `availableTime` = `<5min` short, `<20min` medium, else extended.

- [ ] **Step 3:** Commit.

---

## Task 6: Recall

**Files:** `src/recall.ts` + test.

- [ ] **Step 1: Tests** — mock the AI bridge (`embed` returns deterministic vectors per test text), seed pageviews + embeddings, call `recall({query: 'pasta'})`, assert hits ordered by cosine descending.

- [ ] **Step 2: Implementation** —

```typescript
export interface RecallOptions {
  query: string;
  timeframe?: { sinceMs: number };
  limit?: number;
  /** Inject the embed fn for tests. Default uses shippie.local.ai.embed. */
  embed?: (text: string) => Promise<{ embedding: number[]; source?: string }>;
}

export async function recall(opts: RecallOptions): Promise<RecallHit[]> {
  const limit = opts.limit ?? 5;
  const embed = opts.embed ?? defaultEmbed;
  const queryVec = (await embed(opts.query)).embedding;
  const since = opts.timeframe?.sinceMs ?? Date.now() - 30 * 24 * 3600 * 1000;
  const views = await listPageViews({ since, limit: 1000 });
  const indexed = await Promise.all(
    views.map(async (v) => {
      const e = await getEmbedding(v.id);
      return e ? { v, vec: e } : null;
    }),
  );
  return indexed
    .filter(Boolean)
    .map(({ v, vec }) => ({
      path: v.path,
      viewedAt: v.ts,
      durationMs: v.durationMs ?? 0,
      relevance: cosine(queryVec, vec),
      excerpt: v.excerpt ?? '',
    }))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);
}
```

- [ ] **Step 3: Background indexing** — when `appendPageView` is called and `excerpt` is present, schedule an embed call via the AI bridge in a microtask; on success, `appendEmbedding(viewId, vec)`. Failures are silent (no embedding stored → page view doesn't show up in recall).

- [ ] **Step 4:** Commit.

---

## Task 7: SDK integration

**Files:** `packages/sdk/src/local.ts`.

- [ ] **Step 1:** Add a lazy getter `intelligence` on `local` that dynamic-imports `@shippie/intelligence` and re-exports the four functions. Same pattern as the existing `group` getter.

```typescript
type IntelligenceModule = typeof import('@shippie/intelligence');
let intelModulePromise: Promise<IntelligenceModule> | null = null;
async function loadIntel(): Promise<IntelligenceModule> {
  if (!intelModulePromise) intelModulePromise = import('@shippie/intelligence');
  return intelModulePromise;
}

const intelligenceApi = {
  async patterns(...args: Parameters<IntelligenceModule['patterns']>) {
    return (await loadIntel()).patterns(...args);
  },
  async temporalContext(...args: Parameters<IntelligenceModule['temporalContext']>) {
    return (await loadIntel()).temporalContext(...args);
  },
  async recall(...args: Parameters<IntelligenceModule['recall']>) {
    return (await loadIntel()).recall(...args);
  },
};

// In `export const local`:
intelligence: intelligenceApi,
```

- [ ] **Step 2:** Add `@shippie/intelligence` to `packages/sdk/package.json` deps. `bun install`. Test passes. Commit.

---

## Task 8: Showcase recall demo (Journal)

**Files:** `apps/showcase-journal/src/pages/Recall.tsx` (new) + route wire.

- [ ] **Step 1:** Build a Recall page: search input, list of hits showing path + viewedAt + excerpt + relevance bar. Calls `shippie.local.intelligence.recall({ query, timeframe: { sinceMs: Date.now() - 14 * 24 * 3600 * 1000 } })`.

- [ ] **Step 2: Manual smoke** — open journal, navigate around several entries, then visit Recall and search. Confirm recent entries surface ordered by relevance.

- [ ] **Step 3:** Commit.

---

## Done When

- [ ] `shippie.local.intelligence.patterns()` returns real session/path/preference data after browsing
- [ ] `temporalContext()` correctly buckets time of day + estimates available time
- [ ] `recall({query})` returns hits ordered by cosine similarity
- [ ] Journal Recall demo finds an entry by meaning, not just keyword
- [ ] All package tests green; no repo-wide regressions

## NOT in this plan (deferred)

- Spatial memory + predictive preload — Plan D2.
- Cross-app recall — Plan F (knowledge-graph + intents layer).
- Persistent ranking model that learns user-clicked-most preferences — heuristic for v1.
