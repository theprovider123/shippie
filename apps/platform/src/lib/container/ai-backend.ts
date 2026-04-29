/**
 * Phase B1 — backend selection for the container's AI worker.
 *
 * Order: WebNN NPU → WebGPU → WASM CPU. Detection runs once at worker
 * start; the chosen backend stays for the worker's lifetime so models
 * keep their warm in-memory state across calls.
 *
 * Pure function — accepts an injected `globals` so tests don't need a
 * browser. The plan calls this out explicitly: "bake in now, do not
 * defer".
 */

export type AiBackend = 'webnn' | 'webgpu' | 'wasm' | 'unavailable';

export interface AiBackendGlobals {
  navigator?: {
    ml?: unknown;
    gpu?: unknown;
  };
  WebAssembly?: unknown;
}

export interface BackendDetectionResult {
  backend: AiBackend;
  /** Diagnostic — what was probed and what was found. Useful in logs. */
  reasons: readonly string[];
}

/**
 * Pick the best available backend on this device. The browser ML API
 * (WebNN) targets NPU and is the lowest-power option when present;
 * WebGPU follows for GPU compute; WASM is the safe baseline. If none
 * are present, edge fallback handles the request.
 */
export function selectAiBackend(globals: AiBackendGlobals = readGlobals()): BackendDetectionResult {
  const reasons: string[] = [];
  const nav = globals.navigator;
  if (nav && typeof nav === 'object' && 'ml' in nav && nav.ml) {
    reasons.push('navigator.ml present');
    return { backend: 'webnn', reasons };
  }
  reasons.push('navigator.ml missing');
  if (nav && typeof nav === 'object' && 'gpu' in nav && nav.gpu) {
    reasons.push('navigator.gpu present');
    return { backend: 'webgpu', reasons };
  }
  reasons.push('navigator.gpu missing');
  if (globals.WebAssembly) {
    reasons.push('WebAssembly present');
    return { backend: 'wasm', reasons };
  }
  reasons.push('WebAssembly missing — edge fallback only');
  return { backend: 'unavailable', reasons };
}

function readGlobals(): AiBackendGlobals {
  return {
    navigator: typeof navigator === 'undefined' ? undefined : (navigator as AiBackendGlobals['navigator']),
    WebAssembly: typeof WebAssembly === 'undefined' ? undefined : WebAssembly,
  };
}

/**
 * Tasks that always run via local backends. Anything outside this list
 * (summarise, generate, translate) goes to the edge fallback regardless
 * of detected backend.
 */
const LOCAL_TASKS = new Set(['classify', 'embed', 'sentiment', 'moderate', 'vision']);

export function isLocalTask(task: string): boolean {
  return LOCAL_TASKS.has(task);
}

export function listLocalTasks(): readonly string[] {
  return [...LOCAL_TASKS];
}
