/**
 * Export button. Renders a select with the 5 presets (simple CSV, wide
 * accountant CSV, FreeAgent expenses JSON, FreeAgent bank CSV, ZIP
 * everything) and triggers a download. The file never leaves the
 * browser unless the user shares / uploads it themselves.
 *
 * Marketing-claim discipline: the labels here say "FreeAgent-ready",
 * never "imports in one tap." The export is a file; importing is
 * something the user / their accountant / their script does after.
 */
import { useState } from 'react';
import type { Receipt } from '../lib/store.ts';
import {
  EXPORT_FORMATS,
  buildExportZip,
  receiptsToAccountantCsv,
  receiptsToBankCsv,
  receiptsToCsv,
  receiptsToFreeAgentJson,
  type ExportFormat,
} from '../lib/exports/index.ts';

interface ExportButtonProps {
  receipts: ReadonlyArray<Receipt>;
  /** Optional callback after a successful download — e.g. to mark
   *  receipts as exported in the store. */
  onExported?: (ids: readonly string[]) => void;
}

function renderForFormat(
  format: ExportFormat,
  receipts: ReadonlyArray<Receipt>,
): { bytes: BlobPart; mime: string; ext: string } {
  switch (format) {
    case 'simple-csv':
      return {
        bytes: receiptsToCsv(receipts),
        mime: 'text/csv;charset=utf-8',
        ext: 'csv',
      };
    case 'accountant-csv':
      return {
        bytes: receiptsToAccountantCsv(receipts),
        mime: 'text/csv;charset=utf-8',
        ext: 'csv',
      };
    case 'freeagent-expenses-json':
      return {
        bytes: receiptsToFreeAgentJson(receipts),
        mime: 'application/json',
        ext: 'json',
      };
    case 'freeagent-bank-csv':
      return {
        bytes: receiptsToBankCsv(receipts),
        mime: 'text/csv;charset=utf-8',
        ext: 'csv',
      };
    case 'zip': {
      // Wrap the Uint8Array in a copy that's typed as a fresh ArrayBuffer
      // so TypeScript's Blob() lib types accept it without complaint.
      const u8 = buildExportZip(receipts);
      return {
        bytes: new Uint8Array(u8),
        mime: 'application/zip',
        ext: 'zip',
      };
    }
  }
}

export function ExportButton({ receipts, onExported }: ExportButtonProps) {
  const [format, setFormat] = useState<ExportFormat>('simple-csv');
  const disabled = receipts.length === 0;

  function download() {
    if (disabled) return;
    const { bytes, mime, ext } = renderForFormat(format, receipts);
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().slice(0, 10);
    a.download = `receipts-${today}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onExported?.(receipts.map((r) => r.id));
  }

  return (
    <div className="export-control">
      <label className="export-format">
        <span className="visually-hidden">Export format</span>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as ExportFormat)}
          disabled={disabled}
        >
          {EXPORT_FORMATS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="ghost" onClick={download} disabled={disabled}>
        Download
      </button>
      <p className="muted small export-description">
        {EXPORT_FORMATS.find((f) => f.id === format)?.description}
      </p>
    </div>
  );
}
