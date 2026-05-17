/**
 * CSV export button. Generates a Blob client-side and triggers a
 * download. The CSV never leaves the browser unless the user uploads
 * it themselves.
 */
import { receiptsToCsv } from '../lib/csv.ts';
import type { Receipt } from '../lib/store.ts';

interface ExportButtonProps {
  receipts: ReadonlyArray<Receipt>;
  label?: string;
}

export function ExportButton({ receipts, label = 'Export CSV' }: ExportButtonProps) {
  function download() {
    const csv = receiptsToCsv(receipts);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().slice(0, 10);
    a.download = `receipts-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <button type="button" className="ghost" onClick={download} disabled={receipts.length === 0}>
      {label}
    </button>
  );
}
