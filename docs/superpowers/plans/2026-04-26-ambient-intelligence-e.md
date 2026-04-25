# Ambient Intelligence (Plan E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Background analysis of local data surfaces insights when the user next opens the app. Journal shows "your mood trended down this week"; budget tracker shows "you're 40% over your dining-out average"; recipe app shows "you usually cook Italian on Saturdays — here's something using last week's scanned ingredients."

**Architecture:** A new `packages/ambient` orchestrates analysis through three stages.
1. **Trigger:** SW Periodic Background Sync (Chrome) OR `visibilitychange`-on-foreground fallback (Safari + everywhere else) wakes the orchestrator on a daily-ish cadence.
2. **Analyse:** Each registered analyser reads a window of local data (via the `intelligence` package's storage + the maker's own `shippie.local.db`), computes a result, and produces zero-or-more `Insight` records. AI-backed analysers (sentiment trends, topic clustering) call the AI app's bridge through the open tab — the SW cannot create iframes, so analyses requiring AI **queue** when no tab is open and drain when one becomes available.
3. **Surface:** Insights persist in IndexedDB. The wrapper renders an `<aside>` "insight card" near the top of the page on next render. The card is dismissible; dismissed insights don't reappear.

**Honest UX framing (locked):** "Your app gets smarter every time you open it." Ambient analysis fires at app-open time, not while you sleep. Daily-summary scenarios only land near the time the user usually opens the app.

**Hard prerequisites:** Plan A (`source` field — the dashboard breakdown shows ambient-driven inferences). Plan D1 (`intelligence` package's storage — analysers read from it).

---

## File Structure

**New package:**
- `packages/ambient/{package.json,tsconfig.json,src/bun-test.d.ts}`
- `src/types.ts` — `Insight`, `AmbientConfig`, `Analyser`
- `src/scheduler.ts` — register PBS + visibilitychange fallback
- `src/orchestrator.ts` — `runOnce({analysers, now})`
- `src/queue.ts` — IndexedDB-backed pending-AI queue
- `src/insight-store.ts` — IndexedDB read/write of insights
- `src/analysers/trend.ts` — numeric trend (week-over-week deltas)
- `src/analysers/anomaly.ts` — z-score outlier on numeric collections
- `src/analysers/sentiment-trend.ts` — sentiment slope over journal entries (AI-backed)
- `src/analysers/topic-cluster.ts` — group items by embedding cluster (AI-backed)
- `src/index.ts` — public façade

**Wrapper additions:**
- `packages/sdk/src/wrapper/insight-card.ts` — render top-of-page insight on next render
- `packages/sdk/src/wrapper/observe-init.ts` — drain ambient queue + render due insights on app open
- Service-worker registration in `packages/pwa-injector/src/generate-sw.ts` — add the `periodicsync` event listener

---

## Task 1: Scaffold + types

```typescript
// src/types.ts
export type InsightUrgency = 'low' | 'medium' | 'high';

export interface Insight {
  id: string;
  collection: string;          // e.g. 'entries' for journal
  generatedAt: number;
  urgency: InsightUrgency;
  title: string;
  summary: string;
  /** Optional path the user can tap to investigate. */
  href?: string;
  /** True when shown to the user; render only false ones. */
  shown?: boolean;
  /** True when dismissed; never re-render. */
  dismissed?: boolean;
}

export interface AmbientConfig {
  enabled: boolean;
  /** ms between scheduled runs. PBS approximates this; fallback uses
   *  visibilitychange. */
  intervalMs: number;
  /** Which collections to inspect. */
  collections: string[];
  /** Which analysers to run. */
  analysers: AnalyserId[];
}

export type AnalyserId = 'trend' | 'anomaly' | 'sentiment-trend' | 'topic-cluster';

export interface AnalyserContext {
  collection: string;
  data: ReadonlyArray<Record<string, unknown>>;
  now: number;
  embed?: (text: string) => Promise<{ embedding: number[] }>;
}

export interface Analyser {
  id: AnalyserId;
  /** True when this analyser can run without an open tab (no AI). */
  syncable: boolean;
  run(ctx: AnalyserContext): Promise<Insight[]>;
}

export const DEFAULT_AMBIENT_CONFIG: AmbientConfig = {
  enabled: false,                       // opt-in
  intervalMs: 24 * 60 * 60 * 1000,
  collections: [],
  analysers: ['trend', 'anomaly'],      // sync-only by default
};
```

- [ ] Scaffold workspace package, write types, typecheck, commit.

---

## Task 2: Insight store + queue (IndexedDB)

- [ ] **Tests + implementation** for `appendInsight`, `listUndismissed({collection?})`, `markShown(id)`, `dismiss(id)` against fake-indexeddb. Plus `enqueueAnalysis(req)` and `drainQueue()` for the AI-pending queue (req contains: `analyserId`, `collection`, `cursorTs`, `enqueuedAt`).

- [ ] Commit.

---

## Task 3: Sync analysers (trend + anomaly)

- [ ] **trend.ts** — given a numeric collection with `ts` field (e.g. spending entries), compare last 7 days vs prior 7 days. If delta > 30%, emit Insight `{urgency: 'medium', title: 'Spending up 40%', summary: '...'}`.

- [ ] **anomaly.ts** — z-score over the collection's numeric field. Any value >2σ from the mean → Insight `{urgency: 'medium' if 2-3σ else 'high'}`.

- [ ] Tests with synthetic series; commit.

---

## Task 4: AI analysers (sentiment-trend + topic-cluster)

- [ ] **sentiment-trend.ts** — given journal entries with text, embed each, compute sentiment via the AI bridge (`sentiment` task), produce a slope. Trend down → Insight.

- [ ] **topic-cluster.ts** — embed entries, k-means or single-link cluster (k=3), surface dominant cluster's top tokens.

- [ ] **Tests** mock the AI bridge; assert insight shape + urgency mapping.

- [ ] Mark both `syncable: false` so the orchestrator queues them when no tab is open.

- [ ] Commit.

---

## Task 5: Orchestrator

- [ ] **`orchestrator.ts`**:

```typescript
export async function runOnce(opts: {
  config: AmbientConfig;
  analysers: Analyser[];
  readCollection(name: string, sinceMs: number): Promise<Record<string, unknown>[]>;
  embed?: AnalyserContext['embed'];
  now: number;
}) {
  if (!opts.config.enabled) return;
  for (const collection of opts.config.collections) {
    const data = await opts.readCollection(collection, opts.now - 30 * 24 * 3600 * 1000);
    if (data.length < 5) continue;
    for (const a of opts.analysers.filter((a) => opts.config.analysers.includes(a.id))) {
      if (!a.syncable && !opts.embed) {
        await enqueueAnalysis({ analyserId: a.id, collection, cursorTs: opts.now });
        continue;
      }
      try {
        const insights = await a.run({ collection, data, now: opts.now, embed: opts.embed });
        for (const i of insights) await appendInsight(i);
      } catch (e) {
        console.warn('[ambient] analyser failed', a.id, e);
      }
    }
  }
}
```

- [ ] Tests with stub analyser + stub readCollection.

- [ ] Commit.

---

## Task 6: Scheduler (PBS + visibilitychange fallback)

- [ ] **`scheduler.ts`** — exports `registerScheduler({tag, intervalMs, fallback})`:
  - In SW context (presence of `self.registration`), register Periodic Background Sync with the given tag.
  - On the document side, attach `document.addEventListener('visibilitychange', ...)` and fire the fallback when the page becomes visible AND it's been > intervalMs since the last run (timestamp in IndexedDB).

- [ ] Tests cover both branches with fake globals.

- [ ] Commit.

---

## Task 7: SW integration

- [ ] **Modify `packages/pwa-injector/src/generate-sw.ts`** — emit a `periodicsync` event handler:

```javascript
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'shippie-ambient') return;
  event.waitUntil((async () => {
    // Can't import @shippie/ambient inside SW (different bundle).
    // Instead: enqueue a 'sweep' marker. Document side drains.
    const db = await openShippieAmbientDB();
    await db.put('queue', { kind: 'sweep', ts: Date.now() });
  })());
});
```

- [ ] Tests + commit.

---

## Task 8: Wrapper integration — drain queue + render insights on app open

- [ ] **`packages/sdk/src/wrapper/insight-card.ts`** — render an `<aside>` near `<main>` for each undismissed unread insight. Includes "X" dismiss button → `markDismissed(id)`. Card has subtle entrance (fadeIn + slide).

- [ ] **`packages/sdk/src/wrapper/observe-init.ts`** — after `installPatina()`, schedule a microtask:
  1. Run any sync analysers immediately on app open (no need to wait for PBS — use the open as the trigger).
  2. Drain the AI queue if a Shippie AI bridge can be reached.
  3. Render undismissed insights.

- [ ] Tests + commit.

---

## Task 9: Showcase: Journal mood-trend insight

- [ ] **Modify `apps/showcase-journal/src/main.tsx`** — register the `sentiment-trend` analyser with `collections: ['entries']`. Configure `ambient.enabled = true`.

- [ ] **Manual smoke** — write 7+ journal entries with declining mood, reload → insight card appears at top with "Your mood has trended down this week".

- [ ] Commit.

---

## Done When

- [ ] `runOnce()` produces insights from synthetic data deterministically
- [ ] PBS fires on Chrome installed-PWAs; visibilitychange fallback fires on Safari
- [ ] Insight card renders on app open, dismissible
- [ ] Journal showcase shows a mood-trend insight after declining-mood entries
- [ ] Privacy invariant preserved: input text never leaves device

## NOT in this plan (deferred)

- Cross-app insights (insight derived from multiple apps' data) → Plan F.
- A user-facing "see all past insights" log view → follow-up if the dismiss-only flow proves insufficient.
- Push notifications for high-urgency insights — opt-in flow can land separately.
- Insight feedback ("this was useful / wrong") — needs UX design.
