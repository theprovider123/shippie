/**
 * On-device OCR via Tesseract.js, loaded same-origin through the
 * platform's `/__esm/` proxy. TrOCR remains as a fallback for browsers
 * that fail to initialise Tesseract.
 *
 * Why same-origin: imports from `https://shippie.app/__esm/...` are
 * subject to the platform service worker's cache-first handler, which
 * means the runtime survives offline once warmed. esm.sh would also
 * work in the iframe but would defeat offline + leak a third-party
 * fetch from the user's phone.
 *
 * Why dynamic import: the showcase ships lightweight glue; the OCR
 * worker/runtime/language files only load when the user actually points
 * at a receipt. First run is slow and shows a progress UI; second run
 * loads from cache.
 *
 * Honest limits: OCR still misses on faded receipts, low-light captures,
 * crumpled paper, and any non-Latin script. The UX is review-then-save —
 * never trust extraction. Confidence is reported per field by
 * parse-receipt.ts, never as a raw percentage to the user.
 */
import { resizeImageDataUrl, rotateImageDataUrl } from './image-processing.ts';
import { parseReceipt, type ExtractedReceipt } from './parse-receipt.ts';

const TESSERACT_URL = '/__esm/tesseract.js@6.0.1';
const RUNTIME_URL = '/__esm/@huggingface/transformers@3.0.0';
const MODEL_ID = 'Xenova/trocr-base-printed';
const OCR_MAX_EDGE = 1400;

export type OcrProgress =
  | { phase: 'init' }
  | { phase: 'download'; file?: string; progress: number; loaded?: number; total?: number }
  | { phase: 'compile' }
  | { phase: 'orientation'; attempt: number; total: number }
  | { phase: 'inference'; progress?: number }
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

interface TesseractModule {
  recognize: (
    input: string | Blob,
    language?: string,
    options?: {
      logger?: (info: unknown) => void;
      tessedit_pageseg_mode?: number;
    },
  ) => Promise<{ data?: { text?: string } }>;
  PSM?: { AUTO?: number };
}

let pipelinePromise: Promise<Pipeline> | null = null;

/**
 * Lazily instantiate the fallback TrOCR pipeline. Returns the same
 * Promise on subsequent calls so we never double-load the model.
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
  try {
    return await runTesseractOcr(imageDataUrlOrBlob, onProgress);
  } catch (err) {
    console.warn('Tesseract OCR failed; falling back to TrOCR', err);
    return runTrocrOcr(imageDataUrlOrBlob, onProgress);
  }
}

async function runTesseractOcr(
  imageDataUrlOrBlob: string | Blob,
  onProgress?: OcrProgressHandler,
): Promise<string> {
  onProgress?.({ phase: 'init' });
  let tx: TesseractModule;
  try {
    tx = (await import(/* @vite-ignore */ TESSERACT_URL)) as TesseractModule;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    onProgress?.({ phase: 'error', message: `OCR runtime load failed: ${msg}` });
    throw new Error(`Tesseract runtime not available via /__esm/. (${msg})`);
  }

  onProgress?.({ phase: 'compile' });
  const result = await tx.recognize(imageDataUrlOrBlob, 'eng', {
    tessedit_pageseg_mode: tx.PSM?.AUTO,
    logger: (info: unknown) => {
      if (!info || typeof info !== 'object') return;
      const obj = info as Record<string, unknown>;
      const status = typeof obj.status === 'string' ? obj.status : '';
      const progress = typeof obj.progress === 'number' ? obj.progress : 0;
      if (/recognizing/i.test(status)) {
        onProgress?.({ phase: 'inference', progress: progress * 100 });
      } else if (/loading|download/i.test(status)) {
        onProgress?.({ phase: 'download', file: status, progress: progress * 100 });
      } else if (/initializing|core|worker/i.test(status)) {
        onProgress?.({ phase: 'compile' });
      }
    },
  });
  onProgress?.({ phase: 'done' });
  return (result.data?.text ?? '').trim();
}

async function runTrocrOcr(
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

export interface ReceiptOcrResult {
  text: string;
  imageDataUrl: string;
  orientationTurns: number;
  score: number;
}

/**
 * Receipt photos often arrive sideways on mobile. If the first pass
 * yields no parseable fields, retry rotated variants and keep whichever
 * OCR result gives the review form the most useful pre-fill.
 */
export async function runReceiptOcr(
  imageDataUrl: string,
  onProgress?: OcrProgressHandler,
): Promise<ReceiptOcrResult> {
  const ocrImageDataUrl = await resizeImageDataUrl(imageDataUrl, OCR_MAX_EDGE);
  const rotations = [0, 1, -1, 2];
  let best: ReceiptOcrResult | null = null;

  for (let i = 0; i < rotations.length; i++) {
    const turns = rotations[i] ?? 0;
    onProgress?.({ phase: 'orientation', attempt: i + 1, total: rotations.length });
    const candidateOcrImage = turns === 0 ? ocrImageDataUrl : await rotateImageDataUrl(ocrImageDataUrl, turns);
    const text = await runOcr(candidateOcrImage, onProgress);
    const parsed = parseReceipt(text);
    const score = scoreOcrText(text, parsed);

    if (!best || score > best.score) {
      best = {
        text,
        imageDataUrl: turns === 0 ? imageDataUrl : await rotateImageDataUrl(imageDataUrl, turns),
        orientationTurns: turns,
        score,
      };
    }
    if (hasUsefulCore(parsed, score, text)) break;
  }

  return best ?? { text: '', imageDataUrl, orientationTurns: 0, score: 0 };
}

function scoreOcrText(text: string, parsed: ExtractedReceipt): number {
  let score = Math.min(0.5, text.trim().length / 160);
  score += fieldScore(parsed.vendor.confidence, 1.4, parsed.vendor.value.length > 0);
  score += fieldScore(parsed.total_cents.confidence, 2.2, parsed.total_cents.value != null);
  score += fieldScore(parsed.occurred_on.confidence, 1.4, parsed.occurred_on.value != null);
  score += fieldScore(parsed.tax?.confidence ?? 0, 0.5, (parsed.tax?.value ?? parsed.tax?.rate_bp) != null);
  score += fieldScore(parsed.receipt_ref?.confidence ?? 0, 0.35, parsed.receipt_ref?.value != null);
  score += fieldScore(parsed.payment_method?.confidence ?? 0, 0.35, parsed.payment_method?.value != null);
  return score;
}

function hasUsefulCore(parsed: ExtractedReceipt, score: number, text: string): boolean {
  if (text.trim().length > 80) return true;
  if (parsed.total_cents.value == null) return score >= 4.2;
  return (
    parsed.vendor.value.length > 0 ||
    parsed.occurred_on.value != null ||
    parsed.tax?.value != null ||
    parsed.payment_method?.value != null
  );
}

function fieldScore(confidence: number, weight: number, present: boolean): number {
  return present ? Math.max(0.2, confidence) * weight : 0;
}

/** Reset the cached pipeline (useful for tests; not used in prod). */
export function resetOcrRuntime(): void {
  pipelinePromise = null;
}
