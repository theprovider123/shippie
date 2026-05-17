import type { TranscriptionProgress } from '../lib/transcribe.ts';

interface Props {
  progress: TranscriptionProgress | null;
  modelDownloaded: boolean;
}

/**
 * Surfaces the model-download + inference state honestly. First-run
 * banner says "downloads ~10 MB"; subsequent runs say "transcribing".
 */
export function TranscriptionProgressBar({ progress, modelDownloaded }: Props) {
  if (!progress) {
    return (
      <p className="vm-progress muted small">
        {modelDownloaded ? 'Whisper-tiny is ready on this device.' : 'First run downloads ~10 MB.'}
      </p>
    );
  }
  const percent = typeof progress.fraction === 'number' ? Math.round(progress.fraction * 100) : null;
  return (
    <div className="vm-progress" role="status" aria-live="polite">
      <div className="vm-progress-line">
        <span className="muted small">
          {progress.stage === 'init'
            ? modelDownloaded
              ? 'Loading model…'
              : 'Downloading Whisper-tiny (~10 MB on first run)…'
            : 'Transcribing on this phone…'}
        </span>
        {percent !== null ? <span className="muted small">{percent}%</span> : null}
      </div>
      {percent !== null ? (
        <div className="vm-progress-bar" aria-hidden="true">
          <div className="vm-progress-fill" style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      {progress.message ? <p className="muted small vm-progress-msg">{progress.message}</p> : null}
    </div>
  );
}
