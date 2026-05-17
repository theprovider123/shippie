/**
 * On-device transcription via Whisper-tiny (Transformers.js).
 *
 * Loads the pinned Transformers runtime through the same-origin
 * `/__esm/` proxy the platform already serves. The pipeline is
 * memoized per page lifecycle — first call pulls the model
 * (~10 MB quantized) into the MODEL_CACHE; subsequent calls reuse
 * the warm pipeline.
 *
 * Whisper-tiny is decent on clean English. It gets choppy on noisy
 * audio, non-English speech, and strong accents. The UI lets the
 * user edit the transcript inline after auto-fill — never claim
 * the model is right.
 */

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
}

export interface TranscriptionProgress {
  /** 'init' = downloading model files, 'transcribe' = running inference. */
  stage: 'init' | 'transcribe';
  /** Optional bytes-known progress 0..1. */
  fraction?: number;
  /** Optional descriptive message. */
  message?: string;
}

export type ProgressCallback = (event: TranscriptionProgress) => void;

export interface TranscribeOptions {
  language?: string;
  model?: string;
  onProgress?: ProgressCallback;
}

const DEFAULT_MODEL = 'Xenova/whisper-tiny';
const DEFAULT_RUNTIME_URL = '/__esm/@huggingface/transformers@3.0.0';

interface TransformersModule {
  pipeline: (
    task: string,
    model: string,
    options?: Record<string, unknown>,
  ) => Promise<TransformersPipeline>;
}

type TransformersPipeline = (
  audio: string | Float32Array | ArrayBuffer | Blob,
  options?: Record<string, unknown>,
) => Promise<unknown>;

interface PipelineCacheEntry {
  modelKey: string;
  pipeline: TransformersPipeline;
}

let runtimePromise: Promise<TransformersModule> | null = null;
let pipelineEntry: PipelineCacheEntry | null = null;
let pipelinePromise: Promise<TransformersPipeline> | null = null;

/**
 * Override the dynamic-import URL. Used by tests to inject a stub
 * module without making a real HTTP request.
 */
let runtimeImporter: (url: string) => Promise<TransformersModule> = (url) =>
  // The /* @vite-ignore */ comment prevents Vite from resolving
  // the URL at build time — we WANT the same-origin runtime path.
  import(/* @vite-ignore */ url) as Promise<TransformersModule>;

export interface TranscribeRuntimeForTests {
  setImporter(fn: (url: string) => Promise<TransformersModule>): void;
  reset(): void;
}

/** Test-only handle. Lets specs swap the dynamic import for a stub. */
export const __testRuntime: TranscribeRuntimeForTests = {
  setImporter(fn) {
    runtimeImporter = fn;
  },
  reset() {
    runtimeImporter = (url) => import(/* @vite-ignore */ url) as Promise<TransformersModule>;
    runtimePromise = null;
    pipelineEntry = null;
    pipelinePromise = null;
  },
};

async function loadRuntime(runtimeUrl: string, onProgress?: ProgressCallback): Promise<TransformersModule> {
  if (!runtimePromise) {
    onProgress?.({ stage: 'init', message: 'Loading transcription runtime…' });
    runtimePromise = runtimeImporter(runtimeUrl);
  }
  return runtimePromise;
}

async function getPipeline(
  modelKey: string,
  runtimeUrl: string,
  onProgress?: ProgressCallback,
): Promise<TransformersPipeline> {
  if (pipelineEntry && pipelineEntry.modelKey === modelKey) {
    return pipelineEntry.pipeline;
  }
  if (pipelinePromise) {
    return pipelinePromise;
  }
  pipelinePromise = (async () => {
    const tx = await loadRuntime(runtimeUrl, onProgress);
    onProgress?.({ stage: 'init', message: 'Downloading Whisper-tiny (~10 MB on first run)…' });
    const progressHook = (event: unknown) => {
      if (!onProgress) return;
      const e = event as { status?: string; progress?: number; file?: string };
      if (typeof e.progress === 'number') {
        onProgress({
          stage: 'init',
          fraction: Math.max(0, Math.min(1, e.progress / 100)),
          message: e.file ? `${e.status ?? 'loading'} ${e.file}` : e.status,
        });
      } else if (typeof e.status === 'string') {
        onProgress({ stage: 'init', message: e.status });
      }
    };
    const built = await tx.pipeline('automatic-speech-recognition', modelKey, {
      quantized: true,
      progress_callback: progressHook,
    });
    pipelineEntry = { modelKey, pipeline: built };
    return built;
  })().finally(() => {
    pipelinePromise = null;
  });
  return pipelinePromise;
}

/**
 * Transcribe an audio blob using Whisper-tiny. Returns text plus
 * timestamped segments (when the model produces them — Whisper does).
 */
export async function transcribe(
  audio: Blob,
  opts: TranscribeOptions = {},
): Promise<TranscriptionResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const runtimeUrl = DEFAULT_RUNTIME_URL;
  const pipeline = await getPipeline(model, runtimeUrl, opts.onProgress);
  opts.onProgress?.({ stage: 'transcribe', message: 'Transcribing…' });
  const url =
    typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(audio)
      : '';
  try {
    const pipelineOptions: Record<string, unknown> = {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    };
    if (opts.language) pipelineOptions.language = opts.language;
    const result = (await pipeline(url || audio, pipelineOptions)) as {
      text?: string;
      chunks?: Array<{ text?: string; timestamp?: [number, number] | [number, null] }>;
    };
    const text = (result?.text ?? '').trim();
    const segments: TranscriptionSegment[] = Array.isArray(result?.chunks)
      ? result.chunks
          .map((c) => {
            const ts = Array.isArray(c.timestamp) ? c.timestamp : [0, 0];
            const start = typeof ts[0] === 'number' ? ts[0] : 0;
            const end = typeof ts[1] === 'number' ? ts[1] : start;
            return {
              start,
              end,
              text: (c.text ?? '').trim(),
            } satisfies TranscriptionSegment;
          })
          .filter((s) => s.text.length > 0)
      : [];
    return { text, segments };
  } finally {
    if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(url);
    }
  }
}

/** First five words of a transcript — used as a memo title. */
export function deriveTitle(transcript: string): string {
  const trimmed = transcript.trim();
  if (!trimmed) return 'Untitled memo';
  const words = trimmed.split(/\s+/).slice(0, 5);
  let title = words.join(' ');
  // Strip a trailing punctuation mark for cleanliness.
  title = title.replace(/[.,;:!?]+$/u, '');
  return title || 'Untitled memo';
}
