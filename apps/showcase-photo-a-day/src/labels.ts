/**
 * On-device image classification via Transformers.js, loaded same-origin
 * through the platform's `/__esm/` proxy. Same pattern as receipt-snap's
 * OCR runtime — see that file's docstring for why same-origin matters.
 *
 * Model: Xenova/vit-base-patch16-224 (~85MB quantised). Returns a list
 * of ImageNet-class labels with scores. Caller picks the top N for
 * display + observation.
 */

const RUNTIME_URL = '/__esm/@huggingface/transformers@3.0.0';
const MODEL_ID = 'Xenova/vit-base-patch16-224';

export interface LabelHit { label: string; score: number }

interface ClassifierFn {
  (input: string | Blob, opts?: { topk?: number }): Promise<LabelHit[]>;
}

interface TransformersModule {
  pipeline: (
    task: string,
    model: string,
    options?: { quantized?: boolean; progress_callback?: (info: unknown) => void },
  ) => Promise<ClassifierFn>;
  env?: { useBrowserCache?: boolean; allowLocalModels?: boolean };
}

let pipelinePromise: Promise<ClassifierFn> | null = null;

export async function classifyImage(
  blob: Blob,
  onProgress?: (info: { phase: 'load' | 'infer' | 'done' }) => void,
): Promise<LabelHit[]> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      onProgress?.({ phase: 'load' });
      const tx = (await import(/* @vite-ignore */ RUNTIME_URL)) as TransformersModule;
      if (tx.env) { tx.env.useBrowserCache = true; tx.env.allowLocalModels = false; }
      return tx.pipeline('image-classification', MODEL_ID, { quantized: true });
    })();
  }
  const pipe = await pipelinePromise;
  onProgress?.({ phase: 'infer' });
  const url = URL.createObjectURL(blob);
  try {
    const hits = await pipe(url, { topk: 5 });
    onProgress?.({ phase: 'done' });
    return hits.map((h) => ({
      // ImageNet labels are comma-separated synonyms; the first term is
      // the canonical English noun.
      label: (h.label.split(',')[0] ?? h.label).trim(),
      score: h.score,
    }));
  } finally {
    URL.revokeObjectURL(url);
  }
}
