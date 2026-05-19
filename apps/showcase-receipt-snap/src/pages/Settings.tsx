/**
 * Settings — verbatim privacy banner, CSV export, clear all data,
 * model cache status, review mode toggle (Quick / Accounting), storage
 * discipline (bulk photo discard), and a "Try sample data" helper to
 * load 5 fixture receipts for exploring the export flow.
 *
 * The voice here is honest accounting: what runs where, what's cached,
 * what'll be deleted.
 */
import { ExportButton } from '../components/ExportButton.tsx';
import {
  discardAllPhotos as discardAllPhotosOp,
  estimateBytes,
  type Receipt,
} from '../lib/store.ts';

export type ReviewMode = 'quick' | 'accounting';

interface SettingsPageProps {
  receipts: ReadonlyArray<Receipt>;
  modelWarm: boolean;
  reviewMode?: ReviewMode;
  onChangeReviewMode?: (next: ReviewMode) => void;
  onClearAll: () => void;
  /** Optional — Phase E wiring for "Discard all photos" + "Try sample data".
   *  When omitted (older callers), those controls are not rendered. */
  onDiscardAllPhotos?: () => void;
  onLoadSampleData?: () => void;
  onClearSampleData?: () => void;
  /** True when at least one sample receipt is currently in the inbox.
   *  Drives the visibility of the "Clear sample data" button. */
  hasSampleData?: boolean;
  /** Optional — flips `export_status` on the rows that were exported.
   *  Without this, the export-status state-machine never advances and
   *  the "edited row resets export_status" behaviour never fires. */
  onExported?: (ids: readonly string[]) => void;
}

function formatBytes(b: number): string {
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

// Storage soft-cap — well under Safari's 5 MB localStorage quota.
const QUOTA_WARN_BYTES = 4 * 1024 * 1024;

export function SettingsPage({
  receipts,
  modelWarm,
  reviewMode = 'quick',
  onChangeReviewMode,
  onClearAll,
  onDiscardAllPhotos,
  onLoadSampleData,
  onClearSampleData,
  hasSampleData = false,
  onExported,
}: SettingsPageProps) {
  const bytes = estimateBytes({ receipts: [...receipts] });
  const overBudget = bytes > QUOTA_WARN_BYTES;
  const photoCount = receipts.filter((r) => r.image_data_url != null).length;

  return (
    <section className="page settings-page">
      <p className="eyebrow">Privacy</p>
      <div className="privacy-banner">
        <p>
          Photos and OCR run on this phone. No image leaves the device. The model lives in
          this PWA's cache.
        </p>
      </div>

      <div className="settings-block">
        <p className="eyebrow">Review mode</p>
        <p className="muted small">
          {reviewMode === 'accounting'
            ? 'Accounting fields are visible on every review — net / tax / payment method / receipt # / project / client / reimbursable. Export first, then discard photos when you want to keep storage light.'
            : 'Five quick fields per receipt: vendor, total, date, category, note. Switch to Accounting when you need VAT, payment method, or per-project tagging.'}
        </p>
        <div className="mode-toggle" role="radiogroup" aria-label="Review mode">
          <button
            type="button"
            role="radio"
            aria-checked={reviewMode === 'quick'}
            className={`mode-chip ${reviewMode === 'quick' ? 'active' : ''}`}
            onClick={() => onChangeReviewMode?.('quick')}
          >
            Quick
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={reviewMode === 'accounting'}
            className={`mode-chip ${reviewMode === 'accounting' ? 'active' : ''}`}
            onClick={() => onChangeReviewMode?.('accounting')}
          >
            Accounting
          </button>
        </div>
      </div>

      <div className="settings-block">
        <p className="eyebrow">Export</p>
        <p className="muted small">
          {reviewMode === 'accounting'
            ? 'Accountant CSV, FreeAgent-ready JSON (Expenses API shape), FreeAgent bank-import CSV, or a ZIP bundle of everything for your accountant.'
            : 'One row per receipt: '}
          {reviewMode === 'quick' ? (
            <code>date,vendor,total,currency,category,note</code>
          ) : null}
        </p>
        <ExportButton receipts={receipts} onExported={onExported} />
      </div>

      <div className="settings-block">
        <p className="eyebrow">Model cache</p>
        <p className="muted small">
          {modelWarm
            ? 'Receipt OCR model is cached on this device. Reading new receipts is fast and offline-capable.'
            : 'No model cached yet. The first time you run OCR, ~95 MB will download on Wi-Fi and stay on this phone.'}
        </p>
      </div>

      <div className="settings-block">
        <p className="eyebrow">Storage on this device</p>
        <p className={overBudget ? 'warn small' : 'muted small'}>
          {receipts.length} receipt{receipts.length === 1 ? '' : 's'} · {photoCount} with photo
          · about {formatBytes(bytes)}.
          {overBudget
            ? ' Over the 4 MB safe budget — discard photos or export + clear to free space.'
            : ''}
        </p>
        {onDiscardAllPhotos != null ? (
          <button
            type="button"
            className="ghost"
            disabled={photoCount === 0}
            onClick={() => {
              if (
                confirm(
                  `Discard photos on ${photoCount} receipt${photoCount === 1 ? '' : 's'}? The receipts (vendor, total, etc.) stay. Only the photos are cleared.`,
                )
              ) {
                onDiscardAllPhotos();
              }
            }}
          >
            Discard all photos
          </button>
        ) : null}
        <button
          type="button"
          className="ghost danger"
          disabled={receipts.length === 0}
          onClick={() => {
            if (
              confirm(
                'This deletes every receipt + photo on this device. The model cache stays. Continue?',
              )
            ) {
              onClearAll();
            }
          }}
        >
          Clear all receipts
        </button>
      </div>

      {onLoadSampleData != null ? (
        <div className="settings-block">
          <p className="eyebrow">Try sample data</p>
          <p className="muted small">
            Loads 5 example receipts to explore the export flow. Useful for testing without
            polluting your real inbox — sample rows are tagged and removable in one tap.
          </p>
          <button type="button" className="ghost" onClick={onLoadSampleData}>
            Load sample data
          </button>
          {hasSampleData && onClearSampleData != null ? (
            <button type="button" className="ghost" onClick={onClearSampleData}>
              Clear sample data
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
