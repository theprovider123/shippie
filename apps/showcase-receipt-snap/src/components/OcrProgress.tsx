/**
 * Visible progress for OCR download + inference. Surfaces the first-run
 * cache caveat exactly once per device; subsequent runs mostly show the
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
    return (
      <p className="error" role="alert">
        {state.message}
      </p>
    );
  }
  let label = 'Reading the receipt…';
  let percent: number | null = null;
  if (state.phase === 'init') label = 'Loading runtime…';
  else if (state.phase === 'download') {
    label = state.file ? `Downloading ${state.file}…` : 'Downloading model…';
    percent = state.progress;
  } else if (state.phase === 'compile') label = 'Preparing model…';
  else if (state.phase === 'orientation') label = `Checking orientation ${state.attempt}/${state.total}…`;
  else if (state.phase === 'inference') {
    label = 'Reading the receipt…';
    percent = typeof state.progress === 'number' ? state.progress : null;
  }
  else if (state.phase === 'done') label = 'Done.';

  return (
    <div className="ocr-progress" aria-live="polite">
      {firstRun && state.phase !== 'inference' && state.phase !== 'done' ? (
        <p className="muted small">
          First run downloads the OCR worker and English text data on Wi-Fi. After that, the
          files live in this PWA's cache and subsequent receipts read faster.
        </p>
      ) : null}
      <div className="ocr-progress-row">
        <span className="ocr-progress-label">{label}</span>
        {percent != null ? <span className="ocr-progress-percent">{Math.round(percent)}%</span> : null}
      </div>
      {percent != null ? (
        <div
          className="ocr-progress-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.round(percent))}
          aria-label={label}
        >
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
