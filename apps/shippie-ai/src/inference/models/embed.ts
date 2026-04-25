/**
 * Embedding wrapper - all-MiniLM-L6-v2 feature-extraction.
 *
 * Returns a Float32Array converted to a number[] (postMessage portability),
 * tagged with the hardware backend that ran the inference.
 *
 * Privacy note: the input text never leaves the iframe. The only network
 * traffic this triggers (after first install) is zero - model files are
 * served from Cache Storage by the service worker.
 */
import { createTransformersLocalAi } from '@shippie/local-ai';
import { loadTransformers } from './transformers-host.ts';
import { selectBackend } from '../backend.ts';
import { backendToDevice } from './device-map.ts';
import type { Backend, EmbedRequest, EmbedResult } from '../../types.ts';

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

export async function runEmbed(req: Omit<EmbedRequest, 'task'>): Promise<EmbedResult> {
  const backend = await selectBackend();
  const vec = await getAdapter(backend).embed(req.text);
  // Float32Array isn't structured-cloneable across all engines without
  // round-tripping through Array; convert here so postMessage is boring.
  return { embedding: Array.from(vec), source: backend };
}
