/**
 * Image labelling wrapper - MobileNet-V3-small.
 *
 * Stubbed in v1: vision is opt-in (autoInstall=false in the registry) and
 * the local-ai adapter's labelImage() throws if vision isn't enabled. We
 * surface a clear error here so the dashboard can prompt the user to install
 * vision explicitly.
 *
 * The wrapper still calls selectBackend() and primes the per-backend adapter
 * cache so the shape stays symmetric with classify/embed/sentiment/moderate.
 * Once labelImage() lands in the adapter (v1.5 per the plan), the only edit
 * here is replacing the throw with the real call and packaging the labels.
 */
import { createTransformersLocalAi } from '@shippie/local-ai';
import { loadTransformers } from './transformers-host.ts';
import { selectBackend } from '../backend.ts';
import { backendToDevice } from './device-map.ts';
import type { Backend, VisionRequest, VisionResult } from '../../types.ts';

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

export async function runVision(_req: Omit<VisionRequest, 'task'>): Promise<VisionResult> {
  const backend = await selectBackend();
  // Prime the cache so subsequent calls (post v1.5) reuse the adapter.
  getAdapter(backend);
  throw new Error('vision inference is not enabled in this Shippie AI build');
}
