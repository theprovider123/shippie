/**
 * Phase B1 — AI Web Worker entry.
 *
 * Runs at the container's origin so models cached in Cache Storage are
 * shared across every iframe app inside Shippie. Backend selection
 * runs once at startup; the chosen backend stays for the worker's
 * lifetime so loaded models keep their warm in-memory state across
 * `ai.run` calls from different iframe apps.
 *
 * The worker dynamic-imports `@shippie/local-ai` (Transformers.js
 * adapter) on first local-task call. The actual Transformers runtime
 * is loaded from Shippie's model CDN so the platform does not need to
 * bundle a heavyweight npm dependency into the container shell. If the
 * runtime is unavailable, the worker reports `unavailable`.
 */

import { selectAiBackend, isLocalTask, type AiBackend } from './ai-backend';
import { createAiCacheBudget, type CacheBudget } from './ai-cache-budget';
import type { ShippieLocalAi } from '@shippie/local-runtime-contract';

/**
 * Approximate q8 footprints for the 6 models the showcase library
 * actually exercises. Values come from the plan's cache-budget table
 * and are used only for the LRU planner — the real cache size is
 * whatever Cache Storage reports. Anything not in this table falls back
 * to a 50 MB estimate (matches mid-range q8 transformer models).
 */
const MODEL_BYTE_HINTS: Record<string, number> = {
  'Xenova/all-MiniLM-L6-v2': 6 * 1024 * 1024,
  'Xenova/distilbert-base-uncased-finetuned-sst-2-english': 67 * 1024 * 1024,
  'Xenova/nli-deberta-v3-xsmall': 22 * 1024 * 1024,
  'Xenova/vit-base-patch16-224': 25 * 1024 * 1024,
  'Xenova/trocr-base-printed': 95 * 1024 * 1024,
  'Xenova/whisper-tiny': 10 * 1024 * 1024,
};
const MODEL_FALLBACK_BYTES = 50 * 1024 * 1024;
const SHIPPIE_MODEL_CACHE_NAME = 'shippie.models.v1';
// Phase 1: served from esm.sh (CDN-backed ESM with CORS + 1-year
// immutable cache + transitive bare-specifier resolution). Phase 2
// will mirror this onto models.shippie.app once the CF zone exists,
// but esm.sh unblocks every on-device AI feature today. Pinned to a
// specific version so an upstream breaking change can't break the
// container's AI worker without an explicit code change.
const TRANSFORMERS_RUNTIME_URL = 'https://esm.sh/@huggingface/transformers@3.0.0';

const cacheBudget: CacheBudget = createAiCacheBudget();

interface WireRequest {
  kind: 'shippie.ai.request';
  id: string;
  request: { task: string; input: unknown; options?: Record<string, unknown> };
}

interface WireResponse {
  kind: 'shippie.ai.response';
  id: string;
  ok: boolean;
  result?: {
    task: string;
    output: unknown;
    source: 'local' | 'edge' | 'unavailable';
    backend?: AiBackend;
  };
  error?: { code: string; message: string };
}

interface WorkerScope {
  addEventListener(type: 'message', handler: (event: MessageEvent) => void): void;
  postMessage(message: unknown): void;
}

declare const self: WorkerScope;

const detection = selectAiBackend();
const backend: AiBackend = detection.backend;

let localAiPromise: Promise<ShippieLocalAi | null> | null = null;

function deviceForBackend(b: AiBackend): 'webnn' | 'webgpu' | 'cpu' | undefined {
  if (b === 'webnn') return 'webnn';
  if (b === 'webgpu') return 'webgpu';
  if (b === 'wasm') return 'cpu';
  return undefined;
}

async function loadTransformersRuntime(): Promise<unknown> {
  const cachesApi = (globalThis as { caches?: CacheStorage }).caches;
  if (cachesApi) {
    try {
      const cache = await cachesApi.open(SHIPPIE_MODEL_CACHE_NAME);
      let res = await cache.match(TRANSFORMERS_RUNTIME_URL);
      if (!res) {
        const fetched = await fetch(TRANSFORMERS_RUNTIME_URL);
        if (fetched.ok) {
          await cache.put(TRANSFORMERS_RUNTIME_URL, fetched.clone()).catch(() => {});
          res = fetched;
        }
      }
      if (res?.ok && typeof URL !== 'undefined' && typeof Blob !== 'undefined') {
        const source = await res.text();
        const objectUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
          return await import(/* @vite-ignore */ objectUrl);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      }
    } catch (err) {
      console.warn('[ai-worker] cached Transformers runtime unavailable', err);
    }
  }
  const dynamicImport = (s: string) => import(/* @vite-ignore */ s);
  return dynamicImport(TRANSFORMERS_RUNTIME_URL);
}

async function getLocalAi(): Promise<ShippieLocalAi | null> {
  if (!localAiPromise) {
    localAiPromise = (async () => {
      try {
        const adapter = await import('@shippie/local-ai');
        return adapter.createTransformersLocalAi({
          transformersLoader: async () => {
            // The runtime is intentionally remote and cacheable rather
            // than bundled into the platform JS. This keeps the Shippie
            // container light while still allowing the model runtime to
            // become local after the first successful fetch.
            const mod = await loadTransformersRuntime();
            return mod as never;
          },
          device: deviceForBackend(backend),
          // q8 default — keeps the 6-model footprint at ~225 MB so we
          // stay inside iOS Cache Storage's eviction envelope.
          quantized: true,
          onProgress: (_feature, progress) => {
            // Hook the cache budget on completion so the LRU planner
            // knows what's resident. The progress callback fires with
            // status === 'done' on each downloaded artifact.
            if (progress.status === 'done' && typeof progress.name === 'string') {
              const bytes = MODEL_BYTE_HINTS[progress.name] ?? MODEL_FALLBACK_BYTES;
              const evict = cacheBudget.planEviction(bytes);
              for (const key of evict) {
                cacheBudget.delete(key);
                void evictFromCacheStorage(key);
              }
              cacheBudget.put(progress.name, bytes);
            }
          },
        });
      } catch (err) {
        console.warn('[ai-worker] local AI adapter unavailable', err);
        return null;
      }
    })();
  }
  return localAiPromise;
}

async function evictFromCacheStorage(modelKey: string): Promise<void> {
  // The transformers.js runtime stores model artefacts in `caches.open`
  // by URL keys. We delete every entry whose URL contains the model
  // id; on browsers without Cache Storage this is a no-op.
  const cachesApi = (globalThis as { caches?: CacheStorage }).caches;
  if (!cachesApi) return;
  try {
    const cache = await cachesApi.open(SHIPPIE_MODEL_CACHE_NAME);
    const keys = await cache.keys();
    for (const req of keys) {
      if (req.url.includes(modelKey)) await cache.delete(req);
    }
  } catch (err) {
    console.warn('[ai-worker] cache eviction failed', err);
  }
}

self.addEventListener('message', (event: MessageEvent) => {
  const data = event.data as WireRequest | undefined;
  if (data?.kind !== 'shippie.ai.request') return;
  void handle(data).then((response) => self.postMessage(response));
});

async function handle(message: WireRequest): Promise<WireResponse> {
  const { id, request } = message;
  if (!isLocalTask(request.task)) {
    return reply(id, request.task, null, 'unavailable');
  }
  if (backend === 'unavailable') {
    return reply(id, request.task, null, 'unavailable');
  }
  const ai = await getLocalAi();
  if (!ai) return reply(id, request.task, null, 'unavailable');

  try {
    switch (request.task) {
      case 'embed': {
        const text = stringInput(request.input);
        if (text === null) return errorReply(id, 'invalid_input', 'embed requires a string input');
        const vec = await ai.embed(text);
        return reply(id, 'embed', Array.from(vec), 'local');
      }
      case 'sentiment': {
        const text = stringInput(request.input);
        if (text === null) return errorReply(id, 'invalid_input', 'sentiment requires a string input');
        const out = await ai.sentiment(text);
        return reply(id, 'sentiment', out, 'local');
      }
      case 'classify': {
        const text = stringInput(request.input);
        const labels = readLabels(request.options);
        if (text === null || !labels) {
          return errorReply(id, 'invalid_input', 'classify requires a string input and an options.labels array');
        }
        const out = await ai.classify(text, { labels });
        return reply(id, 'classify', out, 'local');
      }
      case 'moderate': {
        // Reuse zero-shot classification with hostility labels. Keeps the
        // moderation surface honest about how it works under the hood.
        const text = stringInput(request.input);
        if (text === null) return errorReply(id, 'invalid_input', 'moderate requires a string input');
        const out = await ai.classify(text, { labels: ['safe', 'hostile', 'spam'] });
        return reply(id, 'moderate', out, 'local');
      }
      case 'vision': {
        if (!(request.input instanceof Blob)) {
          return errorReply(id, 'invalid_input', 'vision requires a Blob input');
        }
        const labels = await ai.labelImage(request.input);
        return reply(id, 'vision', labels, 'local');
      }
      default:
        return reply(id, request.task, null, 'unavailable');
    }
  } catch (err) {
    return errorReply(id, 'task_failed', err instanceof Error ? err.message : 'unknown error');
  }
}

function stringInput(input: unknown): string | null {
  return typeof input === 'string' ? input : null;
}

function readLabels(options: Record<string, unknown> | undefined): string[] | null {
  if (!options) return null;
  const labels = options.labels;
  if (!Array.isArray(labels)) return null;
  const filtered = labels.filter((x): x is string => typeof x === 'string' && x.length > 0);
  return filtered.length > 0 ? filtered : null;
}

function reply(
  id: string,
  task: string,
  output: unknown,
  source: 'local' | 'edge' | 'unavailable',
): WireResponse {
  return {
    kind: 'shippie.ai.response',
    id,
    ok: true,
    result: { task, output, source, backend },
  };
}

function errorReply(id: string, code: string, message: string): WireResponse {
  return {
    kind: 'shippie.ai.response',
    id,
    ok: false,
    error: { code, message },
  };
}
