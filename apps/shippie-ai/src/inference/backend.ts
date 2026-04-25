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
  const nav =
    deps.navigator ?? (typeof navigator !== 'undefined' ? (navigator as NavigatorLike) : {});

  if (nav.ml) {
    if (await tryWebNN(nav.ml, 'npu')) return 'webnn-npu';
    if (await tryWebNN(nav.ml, 'gpu')) return 'webnn-gpu';
  }
  if (nav.gpu) {
    if (await tryWebGPU(nav.gpu)) return 'webgpu';
  }
  return 'wasm-cpu';
}

async function tryWebNN(
  ml: NonNullable<NavigatorLike['ml']>,
  deviceType: string,
): Promise<boolean> {
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
