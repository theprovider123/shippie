export interface ShippieLocalRuntimeGlobal {
  version?: string;
  capabilities?: () => unknown;
  db?: unknown;
  files?: unknown;
  ai?: unknown;
}

export interface LoadLocalRuntimeOptions {
  endpoint?: string;
}

let loadPromise: Promise<ShippieLocalRuntimeGlobal> | null = null;

export const local = {
  load,
  capabilities,
  get db() {
    return currentLocalRuntime()?.db;
  },
  get files() {
    return currentLocalRuntime()?.files;
  },
  get ai() {
    return currentLocalRuntime()?.ai;
  },
};

export async function load(opts: LoadLocalRuntimeOptions = {}): Promise<ShippieLocalRuntimeGlobal> {
  const existing = currentLocalRuntime();
  if (existing) return existing;
  if (typeof document === 'undefined') throw new Error('shippie.local.load() requires a browser document');
  if (loadPromise) return loadPromise;

  const endpoint = opts.endpoint ?? '/__shippie/local.js';
  loadPromise = new Promise<ShippieLocalRuntimeGlobal>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = endpoint;
    script.async = true;
    script.dataset.shippieLocalRuntime = 'true';
    script.onload = () => {
      const runtime = currentLocalRuntime();
      if (runtime) resolve(runtime);
      else reject(new Error('Shippie local runtime loaded but did not attach window.shippie.local'));
    };
    script.onerror = () => reject(new Error(`Failed to load Shippie local runtime from ${endpoint}`));
    document.head.append(script);
  }).finally(() => {
    loadPromise = null;
  });

  return loadPromise;
}

export async function capabilities(opts: LoadLocalRuntimeOptions = {}): Promise<unknown> {
  const runtime = await load(opts);
  return typeof runtime.capabilities === 'function' ? runtime.capabilities() : null;
}

function currentLocalRuntime(): ShippieLocalRuntimeGlobal | null {
  if (typeof window === 'undefined') return null;
  const runtime = (window as unknown as { shippie?: { local?: ShippieLocalRuntimeGlobal } }).shippie?.local;
  return runtime ?? null;
}
