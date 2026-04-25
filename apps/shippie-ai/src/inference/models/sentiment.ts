/**
 * Sentiment wrapper - DistilBERT SST-2 quantized.
 *
 * Returns { sentiment: 'positive' | 'negative' | 'neutral', score, source }
 * where source is the hardware backend that ran the inference.
 */
import { createTransformersLocalAi } from '@shippie/local-ai';
import { loadTransformers } from './transformers-host.ts';
import { selectBackend } from '../backend.ts';
import { backendToDevice } from './device-map.ts';
import type { Backend, SentimentRequest, SentimentResult } from '../../types.ts';

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

export async function runSentiment(
  req: Omit<SentimentRequest, 'task'>,
): Promise<SentimentResult> {
  const backend = await selectBackend();
  const result = await getAdapter(backend).sentiment(req.text);
  return { sentiment: result.sentiment, score: result.score, source: backend };
}
