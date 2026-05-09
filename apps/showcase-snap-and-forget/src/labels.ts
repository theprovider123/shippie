/**
 * Same on-device classifier as Photo a Day, copy-pasted here so each
 * showcase remains independent (the @shippie/durability extraction is
 * v2 work, not blocking launch).
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
    options?: { quantized?: boolean },
  ) => Promise<ClassifierFn>;
  env?: { useBrowserCache?: boolean; allowLocalModels?: boolean };
}

let pipelinePromise: Promise<ClassifierFn> | null = null;

export async function classifyImage(blob: Blob): Promise<LabelHit[]> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const tx = (await import(/* @vite-ignore */ RUNTIME_URL)) as TransformersModule;
      if (tx.env) { tx.env.useBrowserCache = true; tx.env.allowLocalModels = false; }
      return tx.pipeline('image-classification', MODEL_ID, { quantized: true });
    })();
  }
  const pipe = await pipelinePromise;
  const url = URL.createObjectURL(blob);
  try {
    const hits = await pipe(url, { topk: 5 });
    return hits.map((h) => ({
      label: (h.label.split(',')[0] ?? h.label).trim(),
      score: h.score,
    }));
  } finally {
    URL.revokeObjectURL(url);
  }
}
