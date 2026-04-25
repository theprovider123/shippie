/**
 * Real-inference adapter that wraps @huggingface/transformers (transformers.js).
 *
 * The Transformers module is loaded on demand — usually from
 * https://models.shippie.app/runtime/transformers.js — so the package itself
 * carries no heavyweight runtime dependency. Tests inject a fake module via
 * `transformersLoader`. Models are pulled from `remoteHost` (defaults to the
 * Shippie model CDN) and cached in browser Cache API by the underlying
 * Transformers.js runtime.
 *
 * Scope (Pillar D, ADR 002): embeddings, zero-shot classification, sentiment.
 * Generation and summarization are explicitly out of v1.
 */
import type {
  ClassificationResult,
  LocalAiAvailability,
  SentimentResult,
  ShippieLocalAi,
} from '@shippie/local-runtime-contract';
import { detectLocalAiAvailability } from './capabilities.ts';

export interface TransformersModule {
  pipeline: TransformersPipelineFactory;
  env?: { remoteHost?: string; allowLocalModels?: boolean; allowRemoteModels?: boolean };
}

export type TransformersPipelineFactory = (
  task: TransformersTask,
  model?: string,
  options?: { quantized?: boolean; progress_callback?: (progress: TransformersProgress) => void },
) => Promise<TransformersPipeline>;

export type TransformersTask =
  | 'feature-extraction'
  | 'zero-shot-classification'
  | 'sentiment-analysis';

export interface TransformersProgress {
  status: string;
  name?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

export type TransformersPipeline = (
  input: string,
  args?: Record<string, unknown>,
) => Promise<TransformersOutput>;

export type TransformersOutput =
  | { data: ArrayLike<number>; dims?: number[] }
  | { tolist: () => number[][] }
  | Array<{ label: string; score: number }>
  | { labels: string[]; scores: number[] };

export interface CreateTransformersLocalAiOptions {
  /** Async loader for the Transformers.js module. Tests pass a fake. */
  transformersLoader: () => Promise<TransformersModule>;
  /** Model CDN host. Default: https://models.shippie.app */
  remoteHost?: string;
  /** Per-feature model IDs. */
  models?: {
    embedding?: string;
    classification?: string;
    sentiment?: string;
  };
  /** Progress hook for download UX. */
  onProgress?: (feature: 'embeddings' | 'classification' | 'sentiment', progress: TransformersProgress) => void;
}

const DEFAULT_REMOTE_HOST = 'https://models.shippie.app';

const DEFAULT_MODELS = {
  embedding: 'Xenova/all-MiniLM-L6-v2',
  classification: 'Xenova/nli-deberta-v3-xsmall',
  sentiment: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
};

export function createTransformersLocalAi(opts: CreateTransformersLocalAiOptions): ShippieLocalAi {
  const remoteHost = opts.remoteHost ?? DEFAULT_REMOTE_HOST;
  const models = { ...DEFAULT_MODELS, ...(opts.models ?? {}) };

  let modulePromise: Promise<TransformersModule> | null = null;
  const pipelines = new Map<string, Promise<TransformersPipeline>>();

  const loadModule = async (): Promise<TransformersModule> => {
    if (!modulePromise) {
      modulePromise = (async () => {
        const mod = await opts.transformersLoader();
        if (mod.env) {
          mod.env.remoteHost = remoteHost;
          mod.env.allowRemoteModels = true;
        }
        return mod;
      })();
    }
    return modulePromise;
  };

  const getPipeline = async (
    feature: 'embeddings' | 'classification' | 'sentiment',
    task: TransformersTask,
    model: string,
  ): Promise<TransformersPipeline> => {
    const key = `${task}::${model}`;
    let promise = pipelines.get(key);
    if (!promise) {
      promise = (async () => {
        const mod = await loadModule();
        return mod.pipeline(task, model, {
          progress_callback: (progress) => opts.onProgress?.(feature, progress),
        });
      })();
      pipelines.set(key, promise);
    }
    return promise;
  };

  return {
    available: async (): Promise<LocalAiAvailability> => {
      const baseline = await detectLocalAiAvailability();
      return {
        ...baseline,
        embeddings: true,
        classification: true,
        sentiment: true,
      };
    },

    embed: async (text: string): Promise<Float32Array> => {
      const pipeline = await getPipeline('embeddings', 'feature-extraction', models.embedding);
      const output = await pipeline(text, { pooling: 'mean', normalize: true });
      return toFloat32Vector(output);
    },

    classify: async (text: string, args: { labels: string[] }): Promise<ClassificationResult> => {
      if (args.labels.length === 0) throw new Error('classify requires at least one label');
      const pipeline = await getPipeline('classification', 'zero-shot-classification', models.classification);
      const output = await pipeline(text, { candidate_labels: args.labels });
      return toClassification(output);
    },

    sentiment: async (text: string): Promise<SentimentResult> => {
      const pipeline = await getPipeline('sentiment', 'sentiment-analysis', models.sentiment);
      const output = await pipeline(text);
      return toSentiment(output);
    },

    labelImage: async () => {
      throw new Error('vision inference is not enabled in this Shippie local AI build');
    },
  };
}

function toFloat32Vector(output: TransformersOutput): Float32Array {
  if ('data' in output && output.data) {
    const data = output.data as ArrayLike<number>;
    const dims = (output as { dims?: number[] }).dims;
    if (dims && dims.length >= 2) {
      const last = dims[dims.length - 1]!;
      const slice = new Float32Array(last);
      for (let i = 0; i < last; i++) slice[i] = Number(data[i] ?? 0);
      return slice;
    }
    const arr = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) arr[i] = Number(data[i] ?? 0);
    return arr;
  }
  if ('tolist' in output && typeof output.tolist === 'function') {
    const list = output.tolist();
    const flat = list[0] ?? [];
    return Float32Array.from(flat as number[]);
  }
  throw new Error('embedding pipeline returned an unrecognized output shape');
}

function toClassification(output: TransformersOutput): ClassificationResult {
  if (Array.isArray(output) && output.length > 0 && 'label' in output[0]!) {
    const top = (output as Array<{ label: string; score: number }>)
      .slice()
      .sort((a, b) => b.score - a.score)[0]!;
    return { label: top.label, confidence: top.score };
  }
  if ('labels' in output && Array.isArray(output.labels) && Array.isArray(output.scores)) {
    const labels = output.labels as string[];
    const scores = output.scores as number[];
    let bestIdx = 0;
    for (let i = 1; i < scores.length; i++) {
      if ((scores[i] ?? 0) > (scores[bestIdx] ?? 0)) bestIdx = i;
    }
    return { label: labels[bestIdx]!, confidence: scores[bestIdx] ?? 0 };
  }
  throw new Error('classification pipeline returned an unrecognized output shape');
}

function toSentiment(output: TransformersOutput): SentimentResult {
  if (!Array.isArray(output) || output.length === 0 || !('label' in output[0]!)) {
    throw new Error('sentiment pipeline returned an unrecognized output shape');
  }
  const top = (output as Array<{ label: string; score: number }>)
    .slice()
    .sort((a, b) => b.score - a.score)[0]!;
  const labelLower = top.label.toLowerCase();
  if (labelLower.includes('pos')) return { sentiment: 'positive', score: top.score };
  if (labelLower.includes('neg')) return { sentiment: 'negative', score: top.score };
  return { sentiment: 'neutral', score: top.score };
}

export const DEFAULT_TRANSFORMERS_MODELS = DEFAULT_MODELS;
