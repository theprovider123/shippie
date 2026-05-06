import { useEffect, useState } from 'react';
import {
  entriesToCsv,
  listEntriesForMonth,
  listEntriesForYear,
} from '../db/queries.ts';
import type { Category, Entry } from '../db/schema.ts';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';

export interface ExportProps {
  db: ShippieLocalDb;
  year: number;
  month: number;
  categories: ReadonlyArray<Category>;
  refreshKey: number;
  onToast(message: string): void;
}

type Scope = 'month' | 'year';

export function Export({
  db,
  year,
  month,
  categories,
  refreshKey,
  onToast,
}: ExportProps) {
  const [scope, setScope] = useState<Scope>('month');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [csv, setCsv] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list =
        scope === 'month'
          ? await listEntriesForMonth(db, year, month)
          : await listEntriesForYear(db, year);
      if (cancelled) return;
      setEntries(list);
      setCsv(entriesToCsv(list, categories));
    })();
    return () => {
      cancelled = true;
    };
  }, [db, year, month, scope, refreshKey, categories]);

  const filename =
    scope === 'month'
      ? `ledger-${year}-${String(month).padStart(2, '0')}.csv`
      : `ledger-${year}.csv`;

  async function handleCopy() {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(csv);
        onToast('CSV copied to clipboard.');
        return;
      }
    } catch {
      // fall through to fallback
    }
    onToast('Clipboard unavailable. Use the download button.');
  }

  function handleDownload() {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    onToast(`Downloaded ${filename}.`);
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow-row">
            <span>Export</span>
          </div>
          <h1>CSV</h1>
        </div>
      </header>

      <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
        The CSV is the export. The user owns the data. There's no premium tier that gates this.
      </p>

      <div className="kind-toggle" role="tablist" aria-label="Export scope">
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'month'}
          className={`spend${scope === 'month' ? ' active' : ''}`}
          onClick={() => setScope('month')}
        >
          This month
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'year'}
          className={`spend${scope === 'year' ? ' active' : ''}`}
          onClick={() => setScope('year')}
        >
          {year}
        </button>
      </div>

      <div className="totals-strip">
        <div>
          <span className="label">Rows</span>
          <span className="value">{entries.length}</span>
        </div>
        <div>
          <span className="label">File</span>
          <span className="value" style={{ fontSize: 13, wordBreak: 'break-all' }}>
            {filename}
          </span>
        </div>
        <div>
          <span className="label">Bytes</span>
          <span className="value">{new Blob([csv]).size}</span>
        </div>
      </div>

      <div className="actions">
        <button
          type="button"
          className="primary"
          onClick={handleDownload}
          disabled={entries.length === 0}
        >
          Download
        </button>
        <button type="button" onClick={handleCopy} disabled={entries.length === 0}>
          Copy to clipboard
        </button>
      </div>

      <div className="field">
        <label>Preview</label>
        <textarea
          readOnly
          value={csv || 'No entries to export.'}
          rows={Math.min(14, Math.max(4, entries.length + 1))}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            background: 'var(--surface)',
            whiteSpace: 'pre',
            overflow: 'auto',
          }}
        />
      </div>
    </section>
  );
}
