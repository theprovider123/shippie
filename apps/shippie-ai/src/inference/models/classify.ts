/**
 * Zero-shot classification wrapper.
 *
 * Uses transformers.js zero-shot-classification pipeline (DeBERTa-v3-xsmall
 * NLI). Returns top label + confidence. The wrapper here is intentionally
 * thin — it exists so the router can dispatch by task name without knowing
 * the transformers.js call shape.
 */
import { createTransformersLocalAi } from '@shippie/local-ai';
import { loadTransformers } from './transformers-host.ts';
import type { ClassifyRequest } from '../../types.ts';

let adapter: ReturnType<typeof createTransformersLocalAi> | null = null;

function getAdapter() {
  if (!adapter) {
    adapter = createTransformersLocalAi({
      transformersLoader: loadTransformers,
    });
  }
  return adapter;
}

export async function runClassify(req: Omit<ClassifyRequest, 'task'>) {
  if (!req.labels || req.labels.length === 0) {
    throw new Error('classify requires at least one label');
  }
  return getAdapter().classify(req.text, { labels: req.labels });
}
