/**
 * On-device OCR via Transformers.js, loaded same-origin through the
 * platform's `/__esm/` proxy.
 *
 * Why same-origin: imports from `https://shippie.app/__esm/...` are
 * subject to the platform service worker's cache-first handler, which
 * means the runtime survives offline once warmed. esm.sh would also
 * work in the iframe but would defeat offline + leak a third-party
 * fetch from the user's phone.
 *
 * Why dynamic import: the showcase ships ~3 KB of glue; the model and
 * runtime (~95 MB quantised) only load when the user actually points
 * at a receipt. First run is slow and shows a progress UI; second run
 * loads from MODEL_CACHE in milliseconds.
 *
 * Honest limits: TrOCR-base-printed misses on faded receipts, low-light
 * captures, italic fonts, and any non-Latin script. The UX is review-
 * then-save — never trust the extraction. Confidence is reported per
 * field by parse-receipt.ts, never as a raw percentage to the user.
 */

const RUNTIME_URL = '/__esm/@huggingface/transformers@3.0.0';
const MODEL_ID = 'Xenova/trocr-base-printed';

export type OcrProgress =
  | { phase: 'init' }
  | { phase: 'download'; file?: string; progress: number; loaded?: number; total?: number }
  | { phase: 'compile' }
  | { phase: 'inference' }
  | { phase: 'done' }
  | { phase: 'error'; message: string };

export type OcrProgressHandler = (p: OcrProgress) => void;

interface Pipeline {
  (input: string | Blob): Promise<{ generated_text?: string } | Array<{ generated_text?: string }>>;
}

interface TransformersModule {
  pipeline: (
    task: string,
    model: string,
    options?: { quantized?: boolean; progress_callback?: (info: unknown) => void },
  ) => Promise<Pipeline>;
  env?: {
    allowLocalModels?: boolean;
    useBrowserCache?: boolean;
  };
}

let pipelinePromise: Promise<Pipeline> | null = null;

/**
 * Lazily instantiate the OCR pipeline. Returns the same Promise on
 * subsequent calls so we never double-load the 95 MB model.
 *
 * @throws When the runtime can't be loaded (no `/__esm/` proxy, e.g.
 *   running standalone in dev without the platform). Caller should
 *   surface a useful error and fall back to a manual-entry form.
 */
export async function getOcrPipeline(onProgress?: OcrProgressHandler): Promise<Pipeline> {
  if (pipelinePromise) return pipelinePromise;
  onProgress?.({ phase: 'init' });

  pipelinePromise = (async () => {
    let tx: TransformersModule;
    try {
      tx = (await import(/* @vite-ignore */ RUNTIME_URL)) as TransformersModule;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      onProgress?.({ phase: 'error', message: `runtime load failed: ${msg}` });
      throw new Error(
        `Transformers runtime not available — this app must run inside Shippie (which serves /__esm/) for on-device OCR. (${msg})`,
      );
    }

    if (tx.env) {
      tx.env.useBrowserCache = true;
      tx.env.allowLocalModels = false;
    }

    try {
      const pipe = await tx.pipeline('image-to-text', MODEL_ID, {
        quantized: true,
        progress_callback: (info: unknown) => {
          if (!info || typeof info !== 'object') return;
          const obj = info as Record<string, unknown>;
          const status = typeof obj.status === 'string' ? obj.status : null;
          const file = typeof obj.file === 'string' ? obj.file : undefined;
          const progress = typeof obj.progress === 'number' ? obj.progress : 0;
          const loaded = typeof obj.loaded === 'number' ? obj.loaded : undefined;
          const total = typeof obj.total === 'number' ? obj.total : undefined;
          if (status === 'progress') {
            onProgress?.({ phase: 'download', file, progress, loaded, total });
          } else if (status === 'done') {
            onProgress?.({ phase: 'compile' });
          }
        },
      });
      onProgress?.({ phase: 'done' });
      return pipe;
    } catch (err) {
      pipelinePromise = null;
      const msg = err instanceof Error ? err.message : 'unknown error';
      onProgress?.({ phase: 'error', message: msg });
      throw err;
    }
  })();

  return pipelinePromise;
}

/**
 * Run OCR on a single image (data URL or Blob). Returns the extracted
 * text — caller is responsible for parseReceipt(text). Throws on
 * runtime errors; the page should catch + show a friendly retry.
 */
export async function runOcr(
  imageDataUrlOrBlob: string | Blob,
  onProgress?: OcrProgressHandler,
): Promise<string> {
  const pipe = await getOcrPipeline(onProgress);
  onProgress?.({ phase: 'inference' });
  const result = await pipe(imageDataUrlOrBlob);
  onProgress?.({ phase: 'done' });
  if (Array.isArray(result)) {
    return result.map((r) => r.generated_text ?? '').join('\n').trim();
  }
  return (result.generated_text ?? '').trim();
}

/** Reset the cached pipeline (useful for tests; not used in prod). */
export function resetOcrRuntime(): void {
  pipelinePromise = null;
}
