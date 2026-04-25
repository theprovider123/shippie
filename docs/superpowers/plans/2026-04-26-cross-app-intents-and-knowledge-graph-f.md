# Cross-App Intents + Local Knowledge Graph (Plan F) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

> **Demand-pulled.** This plan is written so it's ready, but the build does NOT start until the user has 3+ Shippie apps installed and is asking for cross-app integration. Don't build infrastructure for a network effect that hasn't arrived.

**Goal:** Two surfaces. (1) **Local intents** — apps declare what they `provide` and what they `consume` in `shippie.json`; the wrapper routes a request from a consumer to a provider running in another installed Shippie app, both on-device, with explicit one-time user consent. (2) **Local knowledge graph** — entities mentioned across multiple installed apps (people, places, recipes, expenses) connect via embedding similarity into a shared graph the user can query.

**Architecture for intents:** Apps register intent providers via `shippie.local.intents.provide('shopping-list', handler)`. Consumers call `shippie.local.intents.request('budget-limit', {category: 'food'})`. The SDK routes through a SharedWorker (one-per-origin scope is too narrow; we need cross-origin, so the AI app's iframe pattern from Plan A applies — `intents.shippie.app` plays the same router role as `ai.shippie.app`). First request from a consumer to a provider triggers a consent dialog rendered in the user's current tab.

**Architecture for KG:** A new `apps/knowledge.shippie.app` PWA (same pattern as ai.shippie.app) holds embeddings for entities extracted from each origin's data. Origins push entity records via postMessage; the KG returns related entities by cosine similarity + relation type. Owner controls visibility per origin.

**Hard prerequisites:**
- Plans A, C, B, G, D1 merged (intents and KG both depend on the AI bridge pattern + the dashboard's enhancement opt-in surface).
- 3+ installed Shippie apps in actual user telemetry. Don't start before that signal.

---

## File Structure

**New apps (separate static deploys, like `ai.shippie.app`):**
- `apps/intents/` — intents router PWA at `intents.shippie.app`
- `apps/knowledge/` — knowledge graph PWA at `knowledge.shippie.app`

**New package:**
- `packages/intelligence/src/intents.ts` — SDK side `provide`/`request`
- `packages/intelligence/src/knowledge-graph.ts` — SDK side `addEntity`/`related`
- `packages/intelligence/src/cross-origin-bridge.ts` — shared iframe-postMessage helper (extract pattern from `packages/sdk/src/local.ts` LocalAI)

**Modified:**
- `packages/sdk/src/local.ts` — add `intents` + `knowledgeGraph` getters
- `packages/shared/src/shippie-json.ts` — schema extension for `intents.provides` / `intents.consumes`
- `apps/web/lib/trust/csp-builder.ts` — auto-add `frame-src intents.shippie.app knowledge.shippie.app`

---

## Task 1: Cross-origin bridge primitive

**Refactor:** the LocalAI iframe pattern in `packages/sdk/src/local.ts` is duplicated in essence across this plan's two new apps + the existing AI bridge. Extract `CrossOriginBridge<TRequest, TResponse>` into `packages/intelligence/src/cross-origin-bridge.ts`. Migrate `LocalAI` to use it (no behaviour change, no commit until tests show identical behaviour).

- [ ] Tests: round-trip a typed request/response through the bridge against a fake iframe. Origin pinning works. pageshow recovery works. Teardown rejects pending.
- [ ] Migrate LocalAI; full sdk test suite stays green. Commit.

---

## Task 2: Intents router app (`apps/intents/`)

The router is a PWA at `intents.shippie.app` whose only job is to route postMessage between embedded iframes from caller origins to provider origins. Mirror `apps/shippie-ai/` structure exactly.

**Routing model:**
- Each provider origin registers itself by opening `intents.shippie.app/register?intent=shopping-list` once (sets a cookie or IndexedDB record on `intents.shippie.app`).
- A consumer iframe loads `intents.shippie.app/route?intent=budget-limit`. The router opens an iframe to every registered provider for that intent, asks each "do you handle this?", awaits the first to respond.
- All cross-origin postMessage uses the strict allowlist pattern from Plan A (`^https://[a-z0-9-]+\.shippie\.app$`).
- Privacy: the router never reads message payloads — it forwards bytes. Privacy claim survives.

- [ ] **Step 1:** Scaffold the app like `apps/shippie-ai/`: index.html (registration UI), route.html (router iframe entry), src/router.ts, src/registry.ts, src/dashboard.tsx (lists registered providers per intent, lets the user revoke).
- [ ] **Step 2:** Tests for the registry (add/remove/list provider) and routing (provider responds → router forwards).
- [ ] **Step 3:** Consent dialog UX — when a consumer first calls a provider that hasn't been used together before, the router renders a consent overlay in the consumer's tab (postMessage to consumer to display the dialog using the wrapper's UI primitives).
- [ ] **Step 4:** Commit per logical chunk.

---

## Task 3: SDK intents API

```typescript
// packages/intelligence/src/intents.ts
export interface IntentDeclaration {
  type: string;
  description: string;
}

export type IntentHandler<TPayload, TResponse> = (
  payload: TPayload,
) => TResponse | Promise<TResponse>;

export function provide<TPayload, TResponse>(
  type: string,
  handler: IntentHandler<TPayload, TResponse>,
): () => void;

export function request<TPayload, TResponse>(
  type: string,
  payload: TPayload,
): Promise<TResponse | null>;

export function listMyProviders(): Promise<IntentDeclaration[]>;
export function listMyConsumers(): Promise<IntentDeclaration[]>;
```

- [ ] **Tests** mock the bridge; assert `provide` registers via the router, `request` routes through and returns response.
- [ ] **Wiring:** in `shippie.json` the maker declares `intents.provides` and `intents.consumes`; the wrapper calls `provide` for each `provides` entry on app boot.
- [ ] Commit.

---

## Task 4: Schema extension + dashboard surface

- [ ] **`packages/shared/src/shippie-json.ts`** — add zod entries for `intents: { provides?: IntentDeclaration[]; consumes?: IntentDeclaration[] }`.
- [ ] **`apps/web/app/dashboard/[appSlug]/enhancements/catalog.ts`** — add `id: 'intents'` entry with snippet: `{ intents: { provides: [], consumes: [] } }` and a docs link.
- [ ] **`apps/web/app/dashboard/[appSlug]/intents/page.tsx`** (new) — show the app's declared providers + consumers, plus a "registered with router" status fetched from `intents.shippie.app/api/registry?slug=...`.
- [ ] Commit.

---

## Task 5: Knowledge graph app (`apps/knowledge/`)

Mirrors `apps/intents/` structure. Different responsibilities:
- Apps push entity records: `{ id, label, kind, sourceOrigin, embedding? }`. If embedding absent, KG embeds the label via the AI bridge.
- Apps query: `related({ label, kinds?, limit?, sources? })` returns `{ entity, relevance, relation }[]`.
- KG owns one IndexedDB per origin scope; cross-origin queries read from all scopes the user has consented to share.

- [ ] **Step 1:** Scaffold + routing identical to `apps/intents/`.
- [ ] **Step 2:** Entity store with embedding cosine search.
- [ ] **Step 3:** Relation derivation — same-source = explicit, cross-source = inferred (similarity > threshold). Inferred relations are tagged so the dashboard can show provenance.
- [ ] **Step 4:** Consent: explicit per-origin opt-in to cross-origin entity sharing.
- [ ] **Step 5:** Commit per chunk.

---

## Task 6: SDK knowledge-graph API

```typescript
// packages/intelligence/src/knowledge-graph.ts
export interface Entity {
  id: string;
  label: string;
  kind: string;
  sourceOrigin?: string;
  embedding?: number[];
}

export interface RelatedHit {
  entity: Entity;
  relation: 'same-source' | 'similar' | 'co-occurring';
  confidence: number;
}

export function addEntity(entity: Entity): Promise<void>;
export function related(query: { label: string; kinds?: string[]; limit?: number; sources?: string[] }): Promise<RelatedHit[]>;
export function query(label: string): Promise<{ direct: Entity[]; inferred: RelatedHit[] }>;
```

- [ ] Tests + commit.

---

## Task 7: Demo — Recipe ↔ Budget cross-app

Two apps cooperating:
- `showcase-recipe` declares `consumes: [{ type: 'budget-limit', description: 'Remaining food budget' }]`.
- `showcase-budget` (NEW — small fourth showcase) declares `provides: [{ type: 'budget-limit', description: 'Remaining budget for food category' }]`.

Recipe app's "meal plan" view calls `shippie.local.intents.request('budget-limit', { category: 'food' })`. Result shows "Your meal plan costs £47. You have £63.50 left."

- [ ] Build minimal `apps/showcase-budget/` (5–8 files, similar to whiteboard scaffold).
- [ ] Wire the consumer call in recipe.
- [ ] Manual smoke confirms the consent dialog shows on first call, intent routes correctly, no network egress beyond the user's own devices.
- [ ] Commit.

---

## Task 8: CSP rewrite + worker plumbing

- [ ] **`apps/web/lib/trust/csp-builder.ts`** — auto-include `frame-src https://intents.shippie.app https://knowledge.shippie.app` alongside the existing `https://ai.shippie.app` allowlist for any maker app that declares intents or KG usage.
- [ ] Worker route additions (mirroring AI app pattern) so dev mode resolves the apps locally.
- [ ] Commit.

---

## Done When

- [ ] Two installed Shippie apps can cooperate via intents without either knowing about the other's implementation
- [ ] Consent dialog appears on first cross-app intent call; persists per (consumer, provider, intent-type) tuple
- [ ] Knowledge-graph queries return same-source entities deterministically and inferred-relation hits with confidence
- [ ] No data leaks across origins without explicit user consent — verified with devtools network panel
- [ ] Dashboard shows the intents an app provides/consumes, with revoke controls

## NOT in this plan (deferred)

- Multi-tenant intent routing (e.g. per-organisation namespacing).
- An intent marketplace — discoverability of intent types beyond the current installed apps.
- Federated KG across users (the user's personal graph stays local; sharing is a future plan).
- Versioning of intent schemas — v1 assumes consumers and providers agree on payload shape.
