/**
 * Storage helpers — wraps `navigator.storage.estimate()` and the model
 * registry so the dashboard can show "510MB used / 2GB available, 4 models
 * installed".
 */
import { MODEL_REGISTRY } from '../inference/models/registry.ts';
import type { InstalledModelInfo } from '../types.ts';

export interface StorageBreakdown {
  /** Total origin storage consumed in bytes (approx — browser-reported). */
  usageBytes: number;
  /** Browser-reported quota for this origin. */
  quotaBytes: number;
  models: InstalledModelInfo[];
}

export async function getStorageBreakdown(): Promise<StorageBreakdown> {
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  const models = await Promise.all(
    MODEL_REGISTRY.map(async (m) => ({
      task: m.task,
      approxBytes: m.approxBytes,
      installed: await isModelCached(m.modelId),
    })),
  );
  return {
    usageBytes: estimate?.usage ?? 0,
    quotaBytes: estimate?.quota ?? 0,
    models,
  };
}

async function isModelCached(modelId: string): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  // transformers.js caches under predictable keys; we look for any cache
  // entry whose URL contains the model id slug. This is approximate but
  // good enough for a dashboard hint.
  try {
    const names = await caches.keys();
    for (const name of names) {
      const cache = await caches.open(name);
      const reqs = await cache.keys();
      if (reqs.some((r) => r.url.includes(modelId))) return true;
    }
  } catch {
    // Cache API not available — fall through to "not installed".
  }
  return false;
}
