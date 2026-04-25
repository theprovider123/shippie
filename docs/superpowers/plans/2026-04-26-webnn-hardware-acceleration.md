# WebNN + Hardware Acceleration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shippie AI picks the device's Neural Processing Unit when available, falls back to GPU then CPU, and reports which backend ran each inference.

**Architecture:** A single `selectBackend()` module feature-detects WebNN (`navigator.ml`), then WebGPU (`navigator.gpu`), then defaults to WASM CPU. Each model wrapper calls it once and passes the result to the transformers.js pipeline via a new `device` option in `@shippie/local-ai`. The chosen backend rides back to the caller as a `source` field on every inference response, threaded through the dedicated worker, the cross-origin router, and the SDK bridge. The dashboard renders a live breakdown of inferences per backend.

**Tech Stack:** transformers.js 3.x (already in `@shippie/local-ai`), WebNN API (`navigator.ml.createContext({ deviceType })`), WebGPU API (`navigator.gpu.requestAdapter()`), bun:test, happy-dom.

---

## File Structure

**New files:**
- `apps/shippie-ai/src/inference/backend.ts` — `selectBackend()` + `Backend` type
- `apps/shippie-ai/src/inference/backend.test.ts` — feature-detection tests with injected globals

**Modified files:**
- `apps/shippie-ai/src/types.ts` — add `Backend`, extend each Result type with `source: Backend`
- `apps/shippie-ai/src/inference/models/classify.ts` — call selectBackend(), pass to adapter, return `{...result, source}`
- `apps/shippie-ai/src/inference/models/embed.ts` — same
- `apps/shippie-ai/src/inference/models/sentiment.ts` — same
- `apps/shippie-ai/src/inference/models/moderate.ts` — same
- `apps/shippie-ai/src/inference/models/vision.ts` — same
- `apps/shippie-ai/src/dashboard/usage-log.ts` — extend `UsageEntry` with optional `source`
- `apps/shippie-ai/src/dashboard/App.tsx` — render "running on" backend pill + per-backend usage breakdown
- `apps/shippie-ai/src/inference/router.ts` — no logic change; just confirms `source` flows through (verified by test)
- `packages/local-ai/src/transformers-adapter.ts` — accept `device` option in factory + thread to `pipeline()`
- `packages/local-ai/src/index.ts` — export `LocalAiDevice` type
- `packages/sdk/src/local.ts` — `LocalAI.classify/embed/sentiment/moderate` typed returns now include `source`
- `packages/sdk/src/local.test.ts` — assert `source` round-trips through the bridge

---

## Task 1: Backend Detection Module

**Files:**
- Create: `apps/shippie-ai/src/inference/backend.ts`
- Test: `apps/shippie-ai/src/inference/backend.test.ts`

The module exports `Backend` (a union string type) and an injectable `selectBackend(deps?)` that probes `navigator.ml` (NPU first, GPU fallback), then `navigator.gpu`, then returns `'wasm-cpu'`. Caching at module scope so we don't re-probe on every inference.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/shippie-ai/src/inference/backend.test.ts
import { describe, expect, it } from 'bun:test';
import { selectBackend, _resetBackendCacheForTest } from './backend.ts';

const fakeMl = (devices: Record<string, boolean>) => ({
  async createContext(opts: { deviceType: string }) {
    if (devices[opts.deviceType]) return { __ctx: opts.deviceType };
    throw new Error(`no ${opts.deviceType}`);
  },
});

const fakeGpu = (ok: boolean) => ({
  async requestAdapter() {
    return ok ? { __adapter: true } : null;
  },
});

describe('selectBackend', () => {
  it('prefers webnn-npu when available', async () => {
    _resetBackendCacheForTest();
    const result = await selectBackend({
      navigator: { ml: fakeMl({ npu: true, gpu: true }), gpu: fakeGpu(true) },
    });
    expect(result).toBe('webnn-npu');
  });

  it('falls back to webnn-gpu when npu unavailable', async () => {
    _resetBackendCacheForTest();
    const result = await selectBackend({
      navigator: { ml: fakeMl({ gpu: true }), gpu: fakeGpu(true) },
    });
    expect(result).toBe('webnn-gpu');
  });

  it('falls back to webgpu when webnn absent', async () => {
    _resetBackendCacheForTest();
    const result = await selectBackend({ navigator: { gpu: fakeGpu(true) } });
    expect(result).toBe('webgpu');
  });

  it('falls back to wasm-cpu when nothing else available', async () => {
    _resetBackendCacheForTest();
    const result = await selectBackend({ navigator: {} });
    expect(result).toBe('wasm-cpu');
  });

  it('caches the result on second call', async () => {
    _resetBackendCacheForTest();
    let calls = 0;
    const ml = {
      async createContext(opts: { deviceType: string }) {
        calls++;
        if (opts.deviceType === 'npu') return { __ctx: 'npu' };
        throw new Error('nope');
      },
    };
    await selectBackend({ navigator: { ml } });
    await selectBackend({ navigator: { ml } });
    expect(calls).toBe(1);
  });

  it('returns wasm-cpu when all probes throw', async () => {
    _resetBackendCacheForTest();
    const result = await selectBackend({
      navigator: {
        ml: {
          async createContext() {
            throw new Error('blocked');
          },
        },
        gpu: {
          async requestAdapter() {
            throw new Error('blocked');
          },
        },
      },
    });
    expect(result).toBe('wasm-cpu');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/devante/Documents/Shippie/apps/shippie-ai && bun test src/inference/backend.test.ts`
Expected: FAIL — `Cannot find module './backend.ts'`

- [ ] **Step 3: Write the implementation**

```typescript
// apps/shippie-ai/src/inference/backend.ts
/**
 * Three-tier hardware backend selection: WebNN (NPU → GPU) → WebGPU → WASM CPU.
 *
 * Cached at module scope. The first call probes; subsequent calls return the
 * cached value. Tests inject a fake `navigator` via `deps` to exercise each
 * branch without needing a real device.
 *
 * Probe order matters:
 *   1. WebNN with deviceType: 'npu' — the dedicated neural processor is the
 *      most efficient option on devices that ship one (M-series Macs,
 *      Pixel 8+, recent Snapdragon).
 *   2. WebNN with deviceType: 'gpu' — falls back to integrated/discrete GPU
 *      via the WebNN runtime. Still benefits from the WebNN abstraction.
 *   3. WebGPU adapter — direct GPU compute without WebNN. Wider browser
 *      support today (April 2026: Chrome stable, Safari 17.4+, Firefox 127+).
 *   4. WASM CPU — the universal fallback. Always works.
 *
 * Probe failures are silent — any throw or absent property drops to the next
 * tier. This is by design: a device that doesn't ship WebNN should not crash,
 * it should just run on whatever it does have.
 */

export type Backend = 'webnn-npu' | 'webnn-gpu' | 'webgpu' | 'wasm-cpu';

interface NavigatorLike {
  ml?: {
    createContext(opts: { deviceType: string }): Promise<unknown>;
  };
  gpu?: {
    requestAdapter(): Promise<unknown>;
  };
}

export interface SelectBackendDeps {
  navigator?: NavigatorLike;
}

let cached: Promise<Backend> | null = null;

export async function selectBackend(deps: SelectBackendDeps = {}): Promise<Backend> {
  if (cached) return cached;
  cached = probe(deps);
  return cached;
}

async function probe(deps: SelectBackendDeps): Promise<Backend> {
  const nav = deps.navigator ?? (typeof navigator !== 'undefined' ? (navigator as NavigatorLike) : {});

  if (nav.ml) {
    if (await tryWebNN(nav.ml, 'npu')) return 'webnn-npu';
    if (await tryWebNN(nav.ml, 'gpu')) return 'webnn-gpu';
  }
  if (nav.gpu) {
    if (await tryWebGPU(nav.gpu)) return 'webgpu';
  }
  return 'wasm-cpu';
}

async function tryWebNN(ml: NonNullable<NavigatorLike['ml']>, deviceType: string): Promise<boolean> {
  try {
    const ctx = await ml.createContext({ deviceType });
    return Boolean(ctx);
  } catch {
    return false;
  }
}

async function tryWebGPU(gpu: NonNullable<NavigatorLike['gpu']>): Promise<boolean> {
  try {
    const adapter = await gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

/** Test seam: clear the cache so each test gets a fresh probe. */
export function _resetBackendCacheForTest(): void {
  cached = null;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd /Users/devante/Documents/Shippie/apps/shippie-ai && bun test src/inference/backend.test.ts`
Expected: 6 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
cd /Users/devante/Documents/Shippie
git add apps/shippie-ai/src/inference/backend.ts apps/shippie-ai/src/inference/backend.test.ts
git commit -m "$(cat <<'EOF'
feat(shippie-ai): backend detection (WebNN → WebGPU → WASM)

Three-tier probe with module-scoped cache. NPU preferred over GPU when
WebNN is present; falls through silently to wasm-cpu when nothing else
is available. Tests cover all four branches via injected navigator.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extend Result Types with `source`

**Files:**
- Modify: `apps/shippie-ai/src/types.ts`

Each result type gains a `source: Backend` field. This is the contract that propagates through every layer.

- [ ] **Step 1: Edit `types.ts` to add Backend re-export and source field**

The current file declares `InferenceTask` and request types but no result types — results are returned as `unknown` from the worker. Add typed result shapes that include `source`.

Append after the existing exports in `apps/shippie-ai/src/types.ts`:

```typescript
import type { Backend } from './inference/backend.ts';
export type { Backend } from './inference/backend.ts';

export interface ClassifyResult {
  label: string;
  confidence: number;
  source: Backend;
}

export interface EmbedResult {
  embedding: number[];
  source: Backend;
}

export interface SentimentResult {
  sentiment: 'positive' | 'neutral' | 'negative';
  score: number;
  source: Backend;
}

export interface ModerateResult {
  flagged: boolean;
  label: string;
  score: number;
  source: Backend;
}

export interface VisionResult {
  labels: Array<{ label: string; score: number }>;
  source: Backend;
}

export type InferenceResultMap = {
  classify: ClassifyResult;
  embed: EmbedResult;
  sentiment: SentimentResult;
  moderate: ModerateResult;
  vision: VisionResult;
};
```

- [ ] **Step 2: Verify the package still typechecks**

Run: `cd /Users/devante/Documents/Shippie/apps/shippie-ai && bun run tsc --noEmit`
Expected: 0 errors. (The existing model wrappers return loosely-typed objects — they will be tightened in Task 4.)

- [ ] **Step 3: Commit**

```bash
git add apps/shippie-ai/src/types.ts
git commit -m "feat(shippie-ai): typed inference results with source field

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add `device` option to `@shippie/local-ai` adapter

**Files:**
- Modify: `packages/local-ai/src/transformers-adapter.ts:23-115`
- Modify: `packages/local-ai/src/index.ts`
- Test: `packages/local-ai/src/transformers-adapter.test.ts`

The transformers.js `pipeline(task, model, options)` accepts a `device` option (`'webgpu' | 'webnn' | 'cpu'`). The adapter currently doesn't pass one. Add an optional `device` parameter at adapter creation time and thread it to every `pipeline()` call.

- [ ] **Step 1: Read the current pipeline call site**

Run: `grep -n "mod.pipeline" /Users/devante/Documents/Shippie/packages/local-ai/src/transformers-adapter.ts`
Expected: a single match around line 111 — `return mod.pipeline(task, model, { ...`. Read 10 lines around it.

- [ ] **Step 2: Write the failing test**

Append to `packages/local-ai/src/transformers-adapter.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test';
import { createTransformersLocalAi } from './transformers-adapter.ts';

describe('createTransformersLocalAi device option', () => {
  it('passes the device option to pipeline()', async () => {
    let receivedDevice: string | undefined;
    const fakeMod = {
      env: { allowRemoteModels: false, remoteHost: '' },
      pipeline: async (_task: string, _model: string, opts: { device?: string }) => {
        receivedDevice = opts.device;
        return async (text: string) => [{ label: 'ok', score: 0.9, embedding: [] }];
      },
    };
    const ai = createTransformersLocalAi({
      transformersLoader: async () => fakeMod as never,
      device: 'webnn',
    });
    await ai.classify('hello', { labels: ['a', 'b'] });
    expect(receivedDevice).toBe('webnn');
  });

  it('omits device when option not set (transformers.js picks default)', async () => {
    let receivedDevice: string | undefined = 'sentinel';
    const fakeMod = {
      env: { allowRemoteModels: false, remoteHost: '' },
      pipeline: async (_t: string, _m: string, opts: { device?: string }) => {
        receivedDevice = opts.device;
        return async () => [{ label: 'ok', score: 0.9 }];
      },
    };
    const ai = createTransformersLocalAi({ transformersLoader: async () => fakeMod as never });
    await ai.classify('hello', { labels: ['a'] });
    expect(receivedDevice).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run, verify it fails**

Run: `cd /Users/devante/Documents/Shippie/packages/local-ai && bun test src/transformers-adapter.test.ts -t "device option"`
Expected: FAIL — `receivedDevice` is `undefined` (because the option isn't passed yet) or import errors.

- [ ] **Step 4: Add the device option in `transformers-adapter.ts`**

Locate the factory's options interface (around lines 20-30) and add:

```typescript
export type LocalAiDevice = 'webnn' | 'webgpu' | 'cpu';

export interface CreateTransformersLocalAiOptions {
  // ... existing options
  /** Hardware backend hint; passed through to transformers.js pipeline(). */
  device?: LocalAiDevice;
}
```

In the body of `createTransformersLocalAi`, capture the option:

```typescript
const device = options.device;
```

Locate the `mod.pipeline(task, model, { ... })` call (around line 111) and add `device` to the options object:

```typescript
return mod.pipeline(task, model, {
  // ... existing options like dtype, progress_callback
  ...(device ? { device } : {}),
});
```

The conditional spread keeps the option absent when undefined, so transformers.js's default selection logic stays in charge.

- [ ] **Step 5: Re-export the type**

In `packages/local-ai/src/index.ts`, add:

```typescript
export type { LocalAiDevice } from './transformers-adapter.ts';
```

- [ ] **Step 6: Run all local-ai tests**

Run: `cd /Users/devante/Documents/Shippie/packages/local-ai && bun test`
Expected: all pass, including the two new device-option tests.

- [ ] **Step 7: Commit**

```bash
git add packages/local-ai/src/transformers-adapter.ts packages/local-ai/src/transformers-adapter.test.ts packages/local-ai/src/index.ts
git commit -m "feat(local-ai): pass-through device option to transformers.js

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire model wrappers to use selectBackend()

**Files:**
- Modify: `apps/shippie-ai/src/inference/models/classify.ts`
- Modify: `apps/shippie-ai/src/inference/models/embed.ts`
- Modify: `apps/shippie-ai/src/inference/models/sentiment.ts`
- Modify: `apps/shippie-ai/src/inference/models/moderate.ts`
- Modify: `apps/shippie-ai/src/inference/models/vision.ts`

Each wrapper computes the backend once, creates the adapter with the matching `device`, calls the underlying model, and returns the result with `source` attached. The transformers.js device names map to `Backend` values: `webnn-npu` and `webnn-gpu` both pass `device: 'webnn'`; `webgpu` passes `device: 'webgpu'`; `wasm-cpu` passes `device: 'cpu'`.

- [ ] **Step 1: Add a tiny shared helper for the mapping**

Create `apps/shippie-ai/src/inference/models/device-map.ts`:

```typescript
import type { Backend } from '../backend.ts';
import type { LocalAiDevice } from '@shippie/local-ai';

export function backendToDevice(backend: Backend): LocalAiDevice {
  switch (backend) {
    case 'webnn-npu':
    case 'webnn-gpu':
      return 'webnn';
    case 'webgpu':
      return 'webgpu';
    case 'wasm-cpu':
      return 'cpu';
  }
}
```

- [ ] **Step 2: Test the helper**

Create `apps/shippie-ai/src/inference/models/device-map.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test';
import { backendToDevice } from './device-map.ts';

describe('backendToDevice', () => {
  it.each([
    ['webnn-npu', 'webnn'],
    ['webnn-gpu', 'webnn'],
    ['webgpu', 'webgpu'],
    ['wasm-cpu', 'cpu'],
  ] as const)('%s → %s', (backend, expected) => {
    expect(backendToDevice(backend)).toBe(expected);
  });
});
```

Run: `cd /Users/devante/Documents/Shippie/apps/shippie-ai && bun test src/inference/models/device-map.test.ts`
Expected: 4 pass.

- [ ] **Step 3: Update `classify.ts`**

Replace the entire body of `apps/shippie-ai/src/inference/models/classify.ts` with:

```typescript
/**
 * Zero-shot classification wrapper.
 *
 * Picks the best available hardware backend on first invocation, creates an
 * adapter scoped to that backend, and threads the source tag back to the
 * caller. The adapter is keyed by backend so a process that ends up on
 * webnn never re-creates the wasm-cpu pipeline.
 */
import { createTransformersLocalAi } from '@shippie/local-ai';
import { loadTransformers } from './transformers-host.ts';
import { selectBackend } from '../backend.ts';
import { backendToDevice } from './device-map.ts';
import type { ClassifyRequest, ClassifyResult, Backend } from '../../types.ts';

const adapters = new Map<Backend, ReturnType<typeof createTransformersLocalAi>>();

function getAdapter(backend: Backend) {
  let adapter = adapters.get(backend);
  if (!adapter) {
    adapter = createTransformersLocalAi({
      transformersLoader: loadTransformers,
      device: backendToDevice(backend),
    });
    adapters.set(backend, adapter);
  }
  return adapter;
}

export async function runClassify(req: Omit<ClassifyRequest, 'task'>): Promise<ClassifyResult> {
  if (!req.labels || req.labels.length === 0) {
    throw new Error('classify requires at least one label');
  }
  const backend = await selectBackend();
  const result = await getAdapter(backend).classify(req.text, { labels: req.labels });
  return { label: result.label, confidence: result.confidence, source: backend };
}
```

- [ ] **Step 4: Apply the same pattern to the other four wrappers**

For each of `embed.ts`, `sentiment.ts`, `moderate.ts`, `vision.ts`:
- Import `selectBackend` from `'../backend.ts'`, `backendToDevice` from `'./device-map.ts'`, and the typed Result from `'../../types.ts'`.
- Replace the module-level `adapter` singleton with a `Map<Backend, Adapter>`.
- Make the function `async`, call `await selectBackend()`, get the matching adapter, run inference, return the typed result with `source: backend`.

Reference shape (substitute the model-specific call):

```typescript
export async function runEmbed(req: Omit<EmbedRequest, 'task'>): Promise<EmbedResult> {
  const backend = await selectBackend();
  const embedding = await getAdapter(backend).embed(req.text);
  return { embedding, source: backend };
}
```

Read each file before editing to preserve existing input validation and error messages.

- [ ] **Step 5: Update existing model tests if any rely on the old return shape**

Run: `cd /Users/devante/Documents/Shippie/apps/shippie-ai && bun test`
Expected: any test that asserted the old result shape (no `source` field) will fail. Read each failing test, then update its expectation to include `source: 'wasm-cpu'` (the test environment has no WebNN/WebGPU, so probe falls through to WASM).

If there are no model-specific tests (the existing test surface lives in router.test.ts), no changes needed at this step.

- [ ] **Step 6: Run the full shippie-ai test suite**

Run: `cd /Users/devante/Documents/Shippie/apps/shippie-ai && bun test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/shippie-ai/src/inference/models/
git commit -m "$(cat <<'EOF'
feat(shippie-ai): model wrappers select backend + return source

Each wrapper picks the best backend on first call (cached), keys the
adapter by backend, and tags the result with source so the dashboard
can show which hardware ran it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Thread `source` through the dedicated worker and router

**Files:**
- Modify: `apps/shippie-ai/src/inference/router.test.ts`

The worker (`worker.ts`) and router (`router.ts`) both pass through `result` opaquely — they do not unpack it, so they require no code change. We add a test that asserts `source` round-trips end-to-end.

- [ ] **Step 1: Add a router round-trip test**

Append to `apps/shippie-ai/src/inference/router.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test';
import { createRouter } from './router.ts';
import type { ClassifyResult } from '../types.ts';

describe('router source field', () => {
  it('passes through the source field unchanged', async () => {
    const dispatchedResult: ClassifyResult = {
      label: 'transport',
      confidence: 0.94,
      source: 'webnn-npu',
    };

    let postedReply: { result?: ClassifyResult } | null = null;
    const fakeSource = {
      postMessage(reply: { result?: ClassifyResult }) {
        postedReply = reply;
      },
    };

    const fakeListenOn = {
      addEventListener(_type: string, listener: EventListener) {
        // synthesize a message immediately
        queueMicrotask(() => {
          listener(
            new MessageEvent('message', {
              data: { requestId: 'req-1', task: 'classify', payload: { text: 'x', labels: ['a'] } },
              origin: 'https://recipe.shippie.app',
              source: fakeSource as unknown as MessageEventSource,
            }),
          );
        });
      },
    };

    createRouter({
      dispatch: async () => dispatchedResult,
      listenOn: fakeListenOn,
      logUsage: async () => {},
    });

    await new Promise((r) => setTimeout(r, 5));
    expect(postedReply?.result?.source).toBe('webnn-npu');
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd /Users/devante/Documents/Shippie/apps/shippie-ai && bun test src/inference/router.test.ts -t "source field"`
Expected: PASS — the router does no unpacking, so the field rides through unchanged.

- [ ] **Step 3: Commit**

```bash
git add apps/shippie-ai/src/inference/router.test.ts
git commit -m "test(shippie-ai): assert source field round-trips through router

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Extend UsageEntry with `source` and log it

**Files:**
- Modify: `apps/shippie-ai/src/types.ts:67-75`
- Modify: `apps/shippie-ai/src/dashboard/usage-log.ts`
- Modify: `apps/shippie-ai/src/inference/router.ts`

The router currently logs `{ origin, task, ts, durationMs }`. Extend the entry with `source` so the dashboard can render a backend breakdown.

- [ ] **Step 1: Extend `UsageEntry`**

Edit `apps/shippie-ai/src/types.ts` to add the field. Replace the existing `UsageEntry` interface:

```typescript
export interface UsageEntry {
  /** Source app origin, e.g. https://recipe.shippie.app */
  origin: string;
  task: InferenceTask;
  /** Wall-clock ms when the inference completed. */
  ts: number;
  /** Inference duration in ms (model run only, not iframe round-trip). */
  durationMs: number;
  /** Hardware backend that ran the inference. Optional for back-compat
   *  with logs written before this field existed. */
  source?: Backend;
}
```

- [ ] **Step 2: Update the router to extract and log `source`**

In `apps/shippie-ai/src/inference/router.ts`, find the `void log({ ... })` call (around line 91) and modify it to extract the `source` from the result before logging. The result type is `unknown` at that point, so narrow defensively:

```typescript
const sourceOf = (r: unknown): Backend | undefined => {
  if (r && typeof r === 'object' && 'source' in r) {
    const s = (r as { source: unknown }).source;
    if (typeof s === 'string') return s as Backend;
  }
  return undefined;
};

// ... inside the handler, after `result` is computed:
const durationMs = now() - start;
void log({
  origin: e.origin,
  task: data.task,
  ts: now(),
  durationMs,
  source: sourceOf(result),
}).catch(() => {});
```

Add `import type { Backend } from '../types.ts';` at the top if not already imported.

- [ ] **Step 3: Update the test from Task 5 to assert the log call receives source**

Add to the same router test file:

```typescript
it('writes source to the usage log', async () => {
  const logs: Array<Parameters<typeof Function>[0]> = [];
  // (re-use the fake source / listenOn pattern from previous test)
  // ... dispatch returns { source: 'webnn-gpu', ... } ...
  // assert the log entry has source: 'webnn-gpu'
});
```

Write the full test mirroring the previous test's fakes; assert the captured log entry's `source` field equals the dispatched result's source.

- [ ] **Step 4: Verify usage-log.ts persists the new field**

Read `apps/shippie-ai/src/dashboard/usage-log.ts`. If it spreads or explicitly enumerates fields when writing to IndexedDB, ensure `source` is included. If it spreads (`{ ...entry }`), no change needed. If it enumerates, add `source: entry.source`.

- [ ] **Step 5: Run the full suite**

Run: `cd /Users/devante/Documents/Shippie/apps/shippie-ai && bun test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/shippie-ai/src/types.ts apps/shippie-ai/src/dashboard/usage-log.ts apps/shippie-ai/src/inference/router.ts apps/shippie-ai/src/inference/router.test.ts
git commit -m "feat(shippie-ai): log inference backend per call

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Dashboard renders backend breakdown

**Files:**
- Modify: `apps/shippie-ai/src/dashboard/App.tsx`

Add a "Running on" pill at the top showing the current backend, and a per-backend usage breakdown derived from logged entries.

- [ ] **Step 1: Read the dashboard App.tsx**

Run: `wc -l /Users/devante/Documents/Shippie/apps/shippie-ai/src/dashboard/App.tsx`

If the file exists, read it first to understand existing layout. If usage entries are already loaded into state, just add the breakdown view. If not, load entries in a `useEffect` from `usage-log.ts`.

- [ ] **Step 2: Add a backend breakdown section**

Insert the following into the dashboard's render output, near the existing storage/installed-models sections:

```tsx
function BackendBreakdown({ entries }: { entries: UsageEntry[] }) {
  const counts = entries.reduce<Record<string, number>>((acc, e) => {
    const k = e.source ?? 'unknown';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const total = entries.length || 1;
  const order: Backend[] = ['webnn-npu', 'webnn-gpu', 'webgpu', 'wasm-cpu'];
  return (
    <section data-testid="backend-breakdown">
      <h3>Hardware</h3>
      <ul>
        {order.map((b) => (
          <li key={b}>
            <span>{labelFor(b)}</span>
            <span>{counts[b] ?? 0} ({Math.round(((counts[b] ?? 0) / total) * 100)}%)</span>
          </li>
        ))}
        {counts.unknown ? (
          <li><span>Pre-detection logs</span><span>{counts.unknown}</span></li>
        ) : null}
      </ul>
    </section>
  );
}

function labelFor(b: Backend): string {
  switch (b) {
    case 'webnn-npu': return 'Neural Processing Unit (WebNN)';
    case 'webnn-gpu': return 'GPU via WebNN';
    case 'webgpu': return 'GPU (WebGPU)';
    case 'wasm-cpu': return 'CPU (WASM)';
  }
}
```

Import `UsageEntry` and `Backend` from `'../types.ts'` at the top of the file.

- [ ] **Step 3: Add a "Running on" pill near the dashboard header**

Above the model list in the same `App.tsx`, render a pill showing the current backend (call `selectBackend()` once on mount):

```tsx
function CurrentBackendPill() {
  const [backend, setBackend] = useState<Backend | null>(null);
  useEffect(() => {
    let cancelled = false;
    selectBackend().then((b) => { if (!cancelled) setBackend(b); });
    return () => { cancelled = true; };
  }, []);
  if (!backend) return null;
  return (
    <div className="backend-pill" data-testid="current-backend">
      Running on {labelFor(backend)}
    </div>
  );
}
```

Import `selectBackend` from `'../inference/backend.ts'`.

- [ ] **Step 4: Manual sanity check via Vite dev**

Run: `cd /Users/devante/Documents/Shippie && bun install` (only if shippie-ai isn't yet linked)
Then: `cd /Users/devante/Documents/Shippie/apps/shippie-ai && bun run vite dev --port 5180`

Open `http://localhost:5180` in Chrome (Chrome on macOS supports WebGPU; WebNN behind `chrome://flags/#enable-webnn` for some users). Expected:
- "Running on" pill visible
- One of: "GPU (WebGPU)", "CPU (WASM)", "Neural Processing Unit (WebNN)" depending on browser
- Backend breakdown section visible (empty until you fire an inference from a sibling tab)

If shippie-ai dependencies aren't installed yet, the prior memory `project_post_cloud_platform.md` flagged this as outstanding — `bun install` at repo root resolves it.

- [ ] **Step 5: Commit**

```bash
git add apps/shippie-ai/src/dashboard/App.tsx
git commit -m "feat(shippie-ai): dashboard shows live backend + per-backend mix

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: SDK bridge typed responses include `source`

**Files:**
- Modify: `packages/sdk/src/local.ts:108-122` (the `LocalAI` typed methods)
- Modify: `packages/sdk/src/local.test.ts`

Tighten `classify`/`embed`/`sentiment`/`moderate` return types to include `source`. The bridge is already opaque about result content — this is a type-only change.

- [ ] **Step 1: Add a Backend type to local.ts**

Add at the top of `packages/sdk/src/local.ts` (after existing imports):

```typescript
export type ShippieAIBackend = 'webnn-npu' | 'webnn-gpu' | 'webgpu' | 'wasm-cpu';
```

(We mirror the type rather than importing across the workspace boundary because `apps/shippie-ai` is not a workspace package consumed by `packages/sdk` — they communicate by postMessage, not by import.)

- [ ] **Step 2: Update each typed method's return type**

Replace lines 108-122 of `packages/sdk/src/local.ts`:

```typescript
classify(text: string, labels: string[]): Promise<{ label: string; confidence: number; source: ShippieAIBackend }> {
  return this.infer('classify', { text, labels });
}

embed(text: string): Promise<{ embedding: number[]; source: ShippieAIBackend }> {
  return this.infer('embed', { text });
}

sentiment(text: string): Promise<{ sentiment: 'positive' | 'neutral' | 'negative'; score: number; source: ShippieAIBackend }> {
  return this.infer('sentiment', { text });
}

moderate(text: string): Promise<{ flagged: boolean; label: string; score: number; source: ShippieAIBackend }> {
  return this.infer('moderate', { text });
}
```

Note: `embed` previously returned `Promise<number[]>`. This is a breaking type change. Search consumers:

Run: `grep -rn "shippie.local.ai.embed\|localAI.embed\|LocalAI.*embed" /Users/devante/Documents/Shippie/apps /Users/devante/Documents/Shippie/packages 2>/dev/null | grep -v node_modules | grep -v ".test."`

If any consumer destructures the embedding directly (`const v = await ai.embed(t)`), update them to `const { embedding } = await ai.embed(t)`. The journal showcase app is a likely consumer — check it.

- [ ] **Step 3: Add a test that asserts `source` rides through**

Add to `packages/sdk/src/local.test.ts`:

```typescript
it('source field rides back through the bridge for classify', async () => {
  const { ai, postMessageToParent } = makeBridge();
  const promise = ai.classify('Uber to Heathrow', ['transport', 'food']);
  const msg = lastSentMessage();
  postMessageToParent({
    requestId: msg.requestId,
    result: { label: 'transport', confidence: 0.94, source: 'webnn-npu' },
  });
  const result = await promise;
  expect(result.source).toBe('webnn-npu');
});
```

The exact harness for `makeBridge` / `postMessageToParent` / `lastSentMessage` already exists in this test file — match its style. If those helpers are absent, write a minimal one inline using the existing happy-dom imports.

- [ ] **Step 4: Run sdk tests**

Run: `cd /Users/devante/Documents/Shippie/packages/sdk && bun test src/local.test.ts`
Expected: all pass.

- [ ] **Step 5: Run typecheck on dependent showcase apps**

Run: `cd /Users/devante/Documents/Shippie/apps/showcase-journal && bun run tsc --noEmit`
Expected: 0 errors. If errors appear (`number[]` vs `{ embedding: number[] }` shape), fix the call sites in journal to destructure.

Repeat for `apps/showcase-recipe`.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/local.ts packages/sdk/src/local.test.ts apps/showcase-journal apps/showcase-recipe
git commit -m "$(cat <<'EOF'
feat(sdk): typed inference results include hardware source

shippie.local.ai.{classify,embed,sentiment,moderate} now return the
backend that ran the inference. embed's return shape becomes
{ embedding, source } — call sites updated.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: End-to-end manual smoke

- [ ] **Step 1: Boot the AI app and one consumer in dev**

Two terminals:

```bash
# Terminal 1
cd /Users/devante/Documents/Shippie/apps/shippie-ai && bun run vite dev --port 5180

# Terminal 2
cd /Users/devante/Documents/Shippie/apps/showcase-journal && bun run vite dev --port 5181
```

- [ ] **Step 2: Visit both, fire a journal entry that triggers sentiment**

Open `http://localhost:5180` (dashboard) — confirm "Running on" pill renders.
Open `http://localhost:5181` (journal) — write an entry, observe sentiment classification fires.

The bridge default points to `https://ai.shippie.app/inference.html`. For local dev, override the iframe src in journal so it points at `http://localhost:5180/inference.html` — there is an existing `LocalAIDeps.iframeSrc` parameter for this. If journal currently hardcodes the default, set a `VITE_SHIPPIE_AI_ORIGIN` env var and read it in journal's `LocalAI` instantiation. Add this only if not already in place.

- [ ] **Step 3: Refresh the dashboard, confirm breakdown updates**

Switch back to the dashboard tab. The backend breakdown section should now show 1+ entries against whichever backend selected. The "Pre-detection logs" row should remain at 0 for newly-recorded entries.

- [ ] **Step 4: Run the full repo test suite to catch any side-effects**

Run: `cd /Users/devante/Documents/Shippie && bun test 2>&1 | tail -30`
Expected: same baseline as before this plan (848 pass / 6 fail / 2 errors per status doc — the 6 failures are pre-existing rate-route mock-pollution, NOT caused by this plan). New test count should rise by approximately 14 (6 backend + 4 device-map + 2 router source + 1 bridge source + ~1 dashboard).

- [ ] **Step 5: Final commit (if anything stayed unstaged)**

```bash
git status
```
If clean, no commit. Otherwise stage the leftover files and commit them with a descriptive message.

---

## Done When

- [ ] `selectBackend()` correctly picks NPU > GPU > WebGPU > WASM with full test coverage of each branch
- [ ] Every model wrapper returns `{ ..., source: Backend }`
- [ ] `UsageEntry` carries `source`; new entries have it, old entries silently lack it (back-compat)
- [ ] Dashboard renders "Running on <backend>" pill plus a per-backend usage breakdown
- [ ] `shippie.local.ai.classify/embed/sentiment/moderate` typed return includes `source`
- [ ] Repo `bun test` baseline preserved (no NEW failures vs pre-plan baseline)
- [ ] Manual two-terminal smoke confirms an inference fired from journal updates the dashboard's breakdown

## NOT in this plan (deferred)

- WebGPU memory-pressure handling (transformers.js already retries on OOM by falling back to CPU; we don't add our own logic)
- WebNN polyfill for absent devices — none exists; we silently fall through
- Per-task backend selection (some tasks like `vision` may benefit from forcing WebGPU even if NPU is available — defer until measurement justifies)
- Backend re-selection on tab visibility change (our cache lasts the page lifetime; iOS Safari iframe eviction already triggers a rebuild via the existing `pageshow` handler)
- Compliance/audit-export of the per-backend usage log — Plan G includes this in the compliance narrative work
