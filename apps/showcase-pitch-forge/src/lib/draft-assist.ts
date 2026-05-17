/**
 * On-device draft assistance via the platform's `/__esm/` Transformers
 * proxy. Same pattern as Receipt Snap (TrOCR) and Voice Memo (Whisper).
 *
 * For pitch drafts we use a small text-summarisation model
 * (`Xenova/distilbart-cnn-6-6`, ~140 MB quantised). The brief is
 * filtered to the section's intent before summarisation so each
 * section gets a different starting draft.
 *
 * Honest fallback: if the runtime can't be loaded, we surface the
 * heuristic key-sentence extractor (`extract-fallback.ts`) and label
 * the result as "key sentences from your brief". We never claim AI
 * output we didn't produce.
 *
 * Privacy: the runtime fetches from same-origin (the platform's
 * `/__esm/` route), the model files are cached in the browser, and
 * inference runs locally. The brief never leaves the device.
 */

import { extractKeySentences } from './extract-fallback.ts';
import type { SectionKind } from './templates.ts';

const RUNTIME_URL = '/__esm/@huggingface/transformers@3.0.0';
const MODEL_ID = 'Xenova/distilbart-cnn-6-6';

export type DraftProgress =
  | { phase: 'init' }
  | { phase: 'download'; file?: string; progress: number }
  | { phase: 'compile' }
  | { phase: 'inference' }
  | { phase: 'done' }
  | { phase: 'fallback'; reason: string }
  | { phase: 'error'; message: string };

export type DraftSource = 'ai' | 'fallback';

export interface DraftResult {
  text: string;
  source: DraftSource;
}

export type DraftProgressHandler = (p: DraftProgress) => void;

interface SummariserPipeline {
  (input: string, opts?: { max_length?: number; min_length?: number }): Promise<
    Array<{ summary_text?: string }>
  >;
}

interface TransformersModule {
  pipeline: (
    task: string,
    model: string,
    options?: { quantized?: boolean; progress_callback?: (info: unknown) => void },
  ) => Promise<SummariserPipeline>;
  env?: { allowLocalModels?: boolean; useBrowserCache?: boolean };
}

let pipelinePromise: Promise<SummariserPipeline> | null = null;

async function loadSummariser(onProgress?: DraftProgressHandler): Promise<SummariserPipeline> {
  if (pipelinePromise) return pipelinePromise;
  onProgress?.({ phase: 'init' });

  pipelinePromise = (async () => {
    let tx: TransformersModule;
    try {
      tx = (await import(/* @vite-ignore */ RUNTIME_URL)) as TransformersModule;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      throw new Error(`runtime load failed: ${msg}`);
    }

    if (tx.env) {
      tx.env.useBrowserCache = true;
      tx.env.allowLocalModels = false;
    }

    const pipe = await tx.pipeline('summarization', MODEL_ID, {
      quantized: true,
      progress_callback: (info: unknown) => {
        if (!info || typeof info !== 'object') return;
        const obj = info as Record<string, unknown>;
        const status = typeof obj.status === 'string' ? obj.status : null;
        const file = typeof obj.file === 'string' ? obj.file : undefined;
        const progress = typeof obj.progress === 'number' ? obj.progress : 0;
        if (status === 'progress') {
          onProgress?.({ phase: 'download', file, progress });
        } else if (status === 'done') {
          onProgress?.({ phase: 'compile' });
        }
      },
    });
    return pipe;
  })();

  try {
    return await pipelinePromise;
  } catch (err) {
    pipelinePromise = null;
    throw err;
  }
}

export interface DraftOptions {
  /** The section we're drafting for. Drives the prefix + fallback bias. */
  kind: SectionKind;
  /** Section title — used as a prefix to nudge the summariser. */
  title: string;
  /** Whether to skip the AI runtime and go straight to the heuristic fallback. */
  forceFallback?: boolean;
}

/** Build a section-aware prompt prefix. Helps the summariser stay on topic. */
function preamble(kind: SectionKind, title: string): string {
  // distilbart-cnn isn't instruction-tuned; we just prepend a one-line
  // hint so the summary is biased toward the section topic.
  const hint =
    kind === 'budget'
      ? 'Budget and pricing details:'
      : kind === 'timeline'
        ? 'Timeline and milestones:'
        : kind === 'team'
          ? 'Team and qualifications:'
          : kind === 'problem'
            ? 'Problem and pain points:'
            : kind === 'solution'
              ? 'Approach and solution:'
              : kind === 'impact'
                ? 'Outcomes and impact:'
                : kind === 'references'
                  ? 'Supporting research and references:'
                  : `${title}:`;
  return hint;
}

/**
 * Generate a section draft from a brief.
 *
 * Returns `{ text, source }` so the UI can label fallbacks honestly.
 * On a clean fallback (no runtime, or `forceFallback`), `source` is
 * `'fallback'`. On a successful AI run, `source` is `'ai'`.
 */
export async function draftSection(
  brief: string,
  opts: DraftOptions,
  onProgress?: DraftProgressHandler,
): Promise<DraftResult> {
  const trimmed = brief.trim();
  if (trimmed.length === 0) {
    return { text: '', source: 'fallback' };
  }

  if (opts.forceFallback) {
    onProgress?.({ phase: 'fallback', reason: 'forced' });
    return {
      text: extractKeySentences(trimmed, { kind: opts.kind }),
      source: 'fallback',
    };
  }

  try {
    const pipe = await loadSummariser(onProgress);
    onProgress?.({ phase: 'inference' });
    const input = `${preamble(opts.kind, opts.title)}\n\n${trimmed}`;
    // Cap output ~ 120 tokens; min ~ 30 to avoid one-sentence drafts.
    const result = await pipe(input, { max_length: 120, min_length: 30 });
    const text = (result[0]?.summary_text ?? '').trim();
    onProgress?.({ phase: 'done' });
    if (text.length === 0) {
      return {
        text: extractKeySentences(trimmed, { kind: opts.kind }),
        source: 'fallback',
      };
    }
    return { text, source: 'ai' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    onProgress?.({ phase: 'fallback', reason: msg });
    return {
      text: extractKeySentences(trimmed, { kind: opts.kind }),
      source: 'fallback',
    };
  }
}

/** Reset the cached pipeline (useful for tests; not used in prod). */
export function resetDraftRuntime(): void {
  pipelinePromise = null;
}
