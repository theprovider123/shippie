/**
 * MediaRecorder helpers — mime detection + duration cap.
 *
 * Pattern lifted from apps/showcase-story-studio/src/lib/audio.ts.
 * Browsers disagree about which audio mime types they'll record.
 * Chrome happily produces audio/webm with Opus; Safari refuses webm
 * but will record audio/mp4 (AAC). We probe and pick the first one
 * the current engine actually supports.
 *
 * Cap: 60 seconds default, configurable up to 5 minutes via
 * Settings → max duration. Whisper-tiny inference time grows
 * roughly linearly with audio length, and on a phone CPU 5 minutes
 * is already a noticeable wait. Recording UI enforces the cap by
 * stopping at MAX_RECORDING_MS.
 */

export const DEFAULT_MAX_RECORDING_MS = 60_000;
export const MIN_MAX_RECORDING_MS = 10_000;
export const MAX_MAX_RECORDING_MS = 300_000;

const PREFERRED_MIME_TYPES: ReadonlyArray<{ mime: string; ext: string }> = [
  { mime: 'audio/webm;codecs=opus', ext: 'webm' },
  { mime: 'audio/webm', ext: 'webm' },
  { mime: 'audio/mp4', ext: 'mp4' },
  { mime: 'audio/aac', ext: 'aac' },
];

export interface SupportedRecording {
  mime: string;
  ext: string;
}

/**
 * Return the first audio mime type the current MediaRecorder will
 * accept, plus the file extension we should use when persisting it.
 * Returns null if the engine doesn't support MediaRecorder at all.
 */
export function pickRecordingMime(
  Recorder: typeof MediaRecorder | undefined = typeof MediaRecorder !== 'undefined'
    ? MediaRecorder
    : undefined,
): SupportedRecording | null {
  if (!Recorder || typeof Recorder.isTypeSupported !== 'function') return null;
  for (const candidate of PREFERRED_MIME_TYPES) {
    if (Recorder.isTypeSupported(candidate.mime)) return candidate;
  }
  return null;
}

/** Clamp a maxDurationMs setting into the supported range. */
export function clampMaxDurationMs(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_RECORDING_MS;
  if (value < MIN_MAX_RECORDING_MS) return MIN_MAX_RECORDING_MS;
  if (value > MAX_MAX_RECORDING_MS) return MAX_MAX_RECORDING_MS;
  return Math.round(value);
}

/** Pretty-print a duration in seconds as `Xs` (<60s) or `m:ss`. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${rest.toString().padStart(2, '0')}`;
}

/** Compute how many ms remain before the cap. Negative means overdue. */
export function remainingMs(elapsedMs: number, maxMs: number): number {
  return Math.max(0, maxMs - elapsedMs);
}
