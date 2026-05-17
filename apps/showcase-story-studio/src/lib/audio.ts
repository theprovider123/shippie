/**
 * MediaRecorder helpers.
 *
 * Browsers disagree about which audio mime types they'll record.
 * Chrome happily produces audio/webm with Opus; Safari refuses webm
 * but will record audio/mp4 (AAC). We probe and pick the first one
 * the current engine actually supports.
 *
 * Cap: 60 seconds per recording. Kid attention span + OPFS budget +
 * we never transcribe so longer recordings have no review path. The
 * cap is enforced here, not at the UI — UI only renders a countdown.
 */

export const MAX_RECORDING_MS = 60_000;

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
 * Returns null if the engine doesn't support MediaRecorder at all
 * (older Safari, locked-down WebKit). The UI uses null to hide the
 * audio button — never show a broken control.
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
