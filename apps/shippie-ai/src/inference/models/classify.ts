/**
 * Zero-shot classification wrapper.
 *
 * Picks the best available hardware backend on first invocation, creates an
 * adapter scoped to that backend, and threads the source tag back to the
 * caller. The adapter is keyed by backend so a process that ends up on
 * webnn never re-creates the wasm-cpu pipeline (and vice versa).
 */
import { createTransformersLocalAi } from '@shippie/local-ai';
import { loadTransformers } from './transformers-host.ts';
import { selectBackend } from '../backend.ts';
import { backendToDevice } from './device-map.ts';
import { emitProgress, setCurrentProgress, type ModelProgressCallback } from './progress.ts';
import type { Backend, ClassifyRequest, ClassifyResult } from '../../types.ts';

const adapters = new Map<Backend, ReturnType<typeof createTransformersLocalAi>>();

function getAdapter(backend: Backend) {
  let adapter = adapters.get(backend);
  if (!adapter) {
    adapter = createTransformersLocalAi({
      transformersLoader: loadTransformers,
      device: backendToDevice(backend),
      // Stable shim — the per-call callback lives in the shared slot
      // (`progress.ts`) so we don't have to rebuild the adapter on
      // every request and lose its pipeline cache.
      onProgress: (_feature, progress) => emitProgress(progress),
    });
    adapters.set(backend, adapter);
  }
  return adapter;
}

export async function runClassify(
  req: Omit<ClassifyRequest, 'task'>,
  onProgress?: ModelProgressCallback,
): Promise<ClassifyResult> {
  if (!req.labels || req.labels.length === 0) {
    throw new Error('classify requires at least one label');
  }
  const backend = await selectBackend();
  setCurrentProgress(onProgress ?? null);
  try {
    const result = await getAdapter(backend).classify(req.text, { labels: req.labels });
    return { label: result.label, confidence: result.confidence, source: backend };
  } finally {
    setCurrentProgress(null);
  }
}
