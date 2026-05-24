/**
 * Shared progress-callback slot for the per-task model wrappers.
 *
 * The transformers.js adapter takes a single `onProgress` hook at
 * factory time (`packages/local-ai/src/transformers-adapter.ts:32`), so
 * we wire a stable, closure-captured shim into every per-backend
 * adapter at construction time. Each `runX(req, onProgress)` writes
 * its callback into this slot before kicking off inference and clears
 * it afterwards.
 *
 * Concurrency: the AI iframe runs inferences sequentially on a single
 * dedicated Worker, so there is never more than one in-flight call
 * sharing the slot at a time. Per-request isolation comes from the
 * `try/finally` reset in each wrapper.
 */
import type { TransformersProgress } from '@shippie/local-ai';

export type ModelProgressCallback = (progress: TransformersProgress) => void;

let currentOnProgress: ModelProgressCallback | null = null;

export function setCurrentProgress(cb: ModelProgressCallback | null): void {
  currentOnProgress = cb;
}

export function emitProgress(progress: TransformersProgress): void {
  if (currentOnProgress) currentOnProgress(progress);
}
