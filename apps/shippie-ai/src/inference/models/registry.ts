/**
 * Model registry — the single source of truth for what models the AI app
 * holds. The dashboard renders this list. The router uses it to lazy-load
 * the right pipeline on demand.
 *
 * Sizes are quoted from each model's quantized ONNX artefact (rounded). They
 * are user-facing on the dashboard — keep them honest. If you swap a model,
 * update the byte count.
 */
import type { InferenceTask } from '../../types.ts';

export interface ModelDescriptor {
  task: InferenceTask;
  /** Human label for the dashboard. */
  label: string;
  /** Hugging Face model ID used by transformers.js. */
  modelId: string;
  /** Approximate quantized download size (bytes). */
  approxBytes: number;
  /** Whether this model auto-installs on first use vs requires an explicit user click. */
  autoInstall: boolean;
}

export const MODEL_REGISTRY: readonly ModelDescriptor[] = [
  {
    task: 'classify',
    label: 'Classification (zero-shot)',
    modelId: 'Xenova/nli-deberta-v3-xsmall',
    approxBytes: 250 * 1024 * 1024,
    autoInstall: true,
  },
  {
    task: 'embed',
    label: 'Embeddings (semantic search)',
    modelId: 'Xenova/all-MiniLM-L6-v2',
    approxBytes: 90 * 1024 * 1024,
    autoInstall: true,
  },
  {
    task: 'sentiment',
    label: 'Sentiment',
    modelId: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
    approxBytes: 70 * 1024 * 1024,
    autoInstall: true,
  },
  {
    task: 'moderate',
    label: 'Moderation',
    modelId: 'Xenova/toxic-bert',
    approxBytes: 100 * 1024 * 1024,
    autoInstall: true,
  },
  {
    task: 'vision',
    label: 'Image labelling',
    modelId: 'Xenova/mobilenet-v3-small',
    approxBytes: 200 * 1024 * 1024,
    autoInstall: false, // deferred — explicit install on dashboard
  },
] as const;

export function getModel(task: InferenceTask): ModelDescriptor | undefined {
  return MODEL_REGISTRY.find((m) => m.task === task);
}

export const SUPPORTED_TASKS: InferenceTask[] = MODEL_REGISTRY.map((m) => m.task);
