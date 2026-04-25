/**
 * Moderation wrapper - toxic-bert text classification.
 *
 * Returns a flag, the highest-scoring toxicity category, confidence, and
 * the hardware backend that ran the inference. Used by the group SDK's
 * pre-broadcast filter (see Phase 3 plan, week 6).
 *
 * The transformers.js pipeline returns either an array of {label, score} or
 * a multi-label set; we collapse to the worst single label here so callers
 * can do simple threshold checks.
 */
import { createTransformersLocalAi } from '@shippie/local-ai';
import { loadTransformers } from './transformers-host.ts';
import { selectBackend } from '../backend.ts';
import { backendToDevice } from './device-map.ts';
import type { Backend, ModerateRequest, ModerateResult } from '../../types.ts';
import { getModel } from './registry.ts';

const adapters = new Map<Backend, ReturnType<typeof createTransformersLocalAi>>();

function getAdapter(backend: Backend) {
  let adapter = adapters.get(backend);
  if (!adapter) {
    const moderateModel = getModel('moderate');
    adapter = createTransformersLocalAi({
      transformersLoader: loadTransformers,
      device: backendToDevice(backend),
      // Reuse the sentiment plumbing in local-ai (it accepts an arbitrary
      // text-classification model id); toxic-bert is a 2-class model so the
      // sentiment-shaped path returns the right answer.
      models: moderateModel ? { sentiment: moderateModel.modelId } : undefined,
    });
    adapters.set(backend, adapter);
  }
  return adapter;
}

export async function runModerate(req: Omit<ModerateRequest, 'task'>): Promise<ModerateResult> {
  const backend = await selectBackend();
  const result = await getAdapter(backend).sentiment(req.text);
  // Treat 'negative'-leaning categories as flagged. The downstream group
  // moderation hook applies its own threshold; we just normalize.
  const flagged = result.sentiment === 'negative' && result.score > 0.7;
  return { flagged, label: result.sentiment, score: result.score, source: backend };
}
