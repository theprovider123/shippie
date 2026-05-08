/**
 * Settings — verbatim privacy banner, CSV export, clear all data,
 * model cache status. The voice here is honest accounting: what runs
 * where, what's cached, what'll be deleted.
 */
import { ExportButton } from '../components/ExportButton.tsx';
import { estimateBytes, type Receipt } from '../lib/store.ts';

interface SettingsPageProps {
  receipts: ReadonlyArray<Receipt>;
  modelWarm: boolean;
  onClearAll: () => void;
}

function formatBytes(b: number): string {
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

export function SettingsPage({ receipts, modelWarm, onClearAll }: SettingsPageProps) {
  const bytes = estimateBytes({ receipts: [...receipts] });
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
        <p className="eyebrow">Export</p>
        <p className="muted small">
          One row per receipt: <code>date,vendor,total,currency,category,note</code>. Drop into
          your spreadsheet of choice.
        </p>
        <ExportButton receipts={receipts} />
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
        <p className="eyebrow">Storage</p>
        <p className="muted small">
          {receipts.length} receipt{receipts.length === 1 ? '' : 's'} · about {formatBytes(bytes)}{' '}
          on this device.
        </p>
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
    </section>
  );
}
