/**
 * Embedding wrapper — all-MiniLM-L6-v2 feature-extraction.
 *
 * Returns a Float32Array. Callers normalize at use site; we hand back the
 * mean-pooled, L2-normalized vector exactly as transformers.js produces it.
 *
 * Privacy note: the input text never leaves the iframe. The only network
 * traffic this triggers (after first install) is zero — model files are
 * served from Cache Storage by the service worker.
 */
import { createTransformersLocalAi } from '@shippie/local-ai';
import { loadTransformers } from './transformers-host.ts';
import type { EmbedRequest } from '../../types.ts';

let adapter: ReturnType<typeof createTransformersLocalAi> | null = null;

function getAdapter() {
  if (!adapter) {
    adapter = createTransformersLocalAi({
      transformersLoader: loadTransformers,
    });
  }
  return adapter;
}

export async function runEmbed(req: Omit<EmbedRequest, 'task'>): Promise<number[]> {
  const vec = await getAdapter().embed(req.text);
  // Float32Array isn't structured-cloneable across all engines without
  // round-tripping through Array; convert here so postMessage is boring.
  return Array.from(vec);
}
