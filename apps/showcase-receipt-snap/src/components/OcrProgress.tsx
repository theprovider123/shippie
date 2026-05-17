/**
 * Visible progress for the model download + inference. Surfaces the
 * "first run downloads ~95 MB on Wi-Fi" caveat exactly once per
 * device — after the runtime is warm, subsequent runs only show the
 * inference indicator.
 */
import type { OcrProgress as OcrProgressEvent } from '../lib/ocr-runtime.ts';

interface OcrProgressProps {
  state: OcrProgressEvent | null;
  firstRun: boolean;
}

function formatBytes(b: number | undefined): string {
  if (!b || b <= 0) return '';
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

export function OcrProgress({ state, firstRun }: OcrProgressProps) {
  if (!state) return null;
  if (state.phase === 'error') {
    return <p className="error">{state.message}</p>;
  }
  let label = 'Reading the receipt…';
  let percent: number | null = null;
  if (state.phase === 'init') label = 'Loading runtime…';
  else if (state.phase === 'download') {
    label = state.file ? `Downloading ${state.file}…` : 'Downloading model…';
    percent = state.progress;
  } else if (state.phase === 'compile') label = 'Preparing model…';
  else if (state.phase === 'inference') label = 'Reading the receipt…';
  else if (state.phase === 'done') label = 'Done.';

  return (
    <div className="ocr-progress">
      {firstRun && state.phase !== 'inference' && state.phase !== 'done' ? (
        <p className="muted small">
          First run downloads ~95 MB on Wi-Fi. After that, the model lives in this PWA's cache —
          subsequent receipts read in seconds.
        </p>
      ) : null}
      <div className="ocr-progress-row">
        <span className="ocr-progress-label">{label}</span>
        {percent != null ? <span className="ocr-progress-percent">{Math.round(percent)}%</span> : null}
      </div>
      {percent != null ? (
        <div className="ocr-progress-bar">
          <div className="ocr-progress-bar-fill" style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
      ) : null}
      {state.phase === 'download' && state.loaded && state.total ? (
        <p className="muted small">
          {formatBytes(state.loaded)} / {formatBytes(state.total)}
        </p>
      ) : null}
    </div>
  );
}
