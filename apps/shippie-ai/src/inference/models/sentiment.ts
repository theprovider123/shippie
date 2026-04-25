/**
 * Sentiment wrapper — DistilBERT SST-2 quantized.
 *
 * Returns { sentiment: 'positive' | 'negative' | 'neutral', score }.
 */
import { createTransformersLocalAi } from '@shippie/local-ai';
import { loadTransformers } from './transformers-host.ts';
import type { SentimentRequest } from '../../types.ts';

let adapter: ReturnType<typeof createTransformersLocalAi> | null = null;

function getAdapter() {
  if (!adapter) {
    adapter = createTransformersLocalAi({
      transformersLoader: loadTransformers,
    });
  }
  return adapter;
}

export async function runSentiment(req: Omit<SentimentRequest, 'task'>) {
  return getAdapter().sentiment(req.text);
}
