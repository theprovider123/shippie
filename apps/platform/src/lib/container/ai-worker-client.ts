/**
 * Container — AI worker client.
 *
 * Phase B1 surface. Owns the postMessage transport to the AI Web
 * Worker (`ai-worker.ts`), correlates requests by id, and exposes a
 * `run` method the bridge handler calls. The actual model loading and
 * backend selection live in the Worker; the client is just the
 * marshalling layer.
 *
 * Tests inject a memory transport so we can exercise queueing and
 * timeout without spawning a real Worker.
 */

import { isLocalTask } from './ai-backend';

export type AiTask =
  | 'classify'
  | 'embed'
  | 'sentiment'
  | 'moderate'
  | 'vision'
  | 'summarise'
  | 'generate'
  | 'translate';

export interface AiRunRequest {
  task: AiTask;
  input: unknown;
  options?: Record<string, unknown>;
}

export interface AiRunResult {
  task: AiTask;
  output: unknown;
  /** Whether the result came from a local model or the edge fallback. */
  source: 'local' | 'edge' | 'unavailable';
  /** Backend the worker actually ran on, when source === 'local'. */
  backend?: 'webnn' | 'webgpu' | 'wasm';
}

interface WireRequest {
  kind: 'shippie.ai.request';
  id: string;
  request: AiRunRequest;
}

interface WireResponse {
  kind: 'shippie.ai.response';
  id: string;
  ok: boolean;
  result?: AiRunResult;
  error?: { code: string; message: string };
}

export interface AiTransport {
  postMessage(message: WireRequest): void;
  addEventListener(handler: (response: WireResponse) => void): () => void;
  terminate(): void;
}

export interface AiWorkerClient {
  run(req: AiRunRequest): Promise<AiRunResult>;
  dispose(): void;
}

export interface AiWorkerClientOptions {
  transport: AiTransport;
  /** Reject pending requests after this many ms. Default 30s. */
  timeoutMs?: number;
  /** Override the id generator (useful for deterministic tests). */
  generateId?: () => string;
  /**
   * Optional edge fallback. Called for tasks the local backends can't
   * serve (summarise, generate, translate) or when the worker reports
   * `source: 'unavailable'`. Returning a result short-circuits the
   * worker round trip.
   */
  edgeFallback?: (req: AiRunRequest) => Promise<AiRunResult>;
}

const DEFAULT_TIMEOUT = 30_000;

let monoCounter = 0;

export function createAiWorkerClient(options: AiWorkerClientOptions): AiWorkerClient {
  const { transport, edgeFallback } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
  const idFor = options.generateId ?? (() => `ai_${++monoCounter}_${Date.now()}`);
  const pending = new Map<string, {
    resolve: (r: AiRunResult) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
    request: AiRunRequest;
  }>();

  const off = transport.addEventListener((response) => {
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    clearTimeout(entry.timer);
    if (response.ok && response.result) {
      // Worker reports unavailable → try edge fallback before failing.
      if (response.result.source === 'unavailable' && edgeFallback) {
        edgeFallback(entry.request).then(entry.resolve, entry.reject);
        return;
      }
      entry.resolve(response.result);
    } else {
      entry.reject(new Error(response.error?.message ?? 'AI worker error'));
    }
  });

  return {
    async run(request) {
      // Tasks the local backends can't serve go straight to the edge.
      if (!isLocalTask(request.task)) {
        if (!edgeFallback) {
          throw new Error(`Task ${request.task} requires edge fallback, none configured`);
        }
        return edgeFallback(request);
      }
      return new Promise<AiRunResult>((resolve, reject) => {
        const id = idFor();
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`AI request timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer, request });
        transport.postMessage({ kind: 'shippie.ai.request', id, request });
      });
    },
    dispose() {
      off();
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error('AI worker client disposed'));
      }
      pending.clear();
      transport.terminate();
    },
  };
}

/**
 * Build an AiTransport over a real Worker. Kept separate from the client
 * so tests can inject a memory transport instead of a real Worker.
 */
export function createWorkerTransport(worker: Worker): AiTransport {
  return {
    postMessage(message) {
      worker.postMessage(message);
    },
    addEventListener(handler) {
      const listener = (event: MessageEvent) => {
        const data = event.data as WireResponse | undefined;
        if (data?.kind === 'shippie.ai.response') handler(data);
      };
      worker.addEventListener('message', listener);
      return () => worker.removeEventListener('message', listener);
    },
    terminate() {
      worker.terminate();
    },
  };
}

/**
 * In-memory transport for tests. The handler simulates the worker's
 * response handler — tests inject the response logic directly.
 */
export function createMemoryAiTransport(handler: (req: WireRequest) => WireResponse | Promise<WireResponse>): AiTransport {
  const listeners = new Set<(response: WireResponse) => void>();
  return {
    async postMessage(message) {
      const response = await handler(message);
      // Defer to next microtask so callers always observe async behaviour.
      queueMicrotask(() => {
        for (const l of listeners) l(response);
      });
    },
    addEventListener(handler) {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
    terminate() {
      listeners.clear();
    },
  };
}
