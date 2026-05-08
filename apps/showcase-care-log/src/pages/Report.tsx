/**
 * Report — date range picker + print-CSS PDF view for a clinician.
 */
import { useMemo, useState } from 'react';
import type * as Y from 'yjs';
import {
  readHandover,
  readMedDoses,
  readMeds,
  readMeta,
  readSymptoms,
} from '../sync/care-doc.ts';
import { useYjs } from '../sync/useYjs.ts';
import { buildReportData, defaultRange } from '../lib/pdf-data.ts';
import { PrintView } from '../components/PrintView.tsx';

interface Props {
  doc: Y.Doc;
}

export function ReportPage({ doc }: Props) {
  const meta = useYjs(doc, (d) => readMeta(d));
  const meds = useYjs(doc, (d) => readMeds(d));
  const doses = useYjs(doc, (d) => readMedDoses(d));
  const symptoms = useYjs(doc, (d) => readSymptoms(d));
  const handover = useYjs(doc, (d) => readHandover(d));

  const initial = defaultRange(7);
  const [startISO, setStartISO] = useState(initial.startISO);
  const [endISO, setEndISO] = useState(initial.endISO);
  const [includedHandoverIds, setIncludedHandoverIds] = useState<Set<string>>(new Set());

  function toggleHandover(id: string) {
    setIncludedHandoverIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const data = useMemo(
    () =>
      buildReportData({
        startISO,
        endISO,
        meds,
        doses,
        symptoms,
        handover,
        includedHandoverIds,
      }),
    [startISO, endISO, meds, doses, symptoms, handover, includedHandoverIds],
  );

  function setLast(days: number) {
    const r = defaultRange(days);
    setStartISO(r.startISO);
    setEndISO(r.endISO);
  }

  return (
    <section>
      <p className="cl-page-eyebrow">Report</p>
      <h2 className="cl-page-title">Take this to the GP.</h2>

      <div className="cl-section">
        <div className="cl-section-head">
          <h3 className="cl-section-title">Date range</h3>
        </div>
        <div className="cl-card">
          <div className="cl-toggle-row">
            <button type="button" className="cl-btn" data-size="sm" onClick={() => setLast(7)}>
              Last 7 days
            </button>
            <button type="button" className="cl-btn" data-size="sm" onClick={() => setLast(14)}>
              Last 14 days
            </button>
            <button type="button" className="cl-btn" data-size="sm" onClick={() => setLast(30)}>
              Last 30 days
            </button>
          </div>
          <div className="cl-form-row" style={{ marginTop: '0.75rem' }}>
            <span className="cl-form-label">From</span>
            <input
              type="date"
              value={startISO}
              onChange={(e) => setStartISO(e.target.value)}
            />
          </div>
          <div className="cl-form-row">
            <span className="cl-form-label">To</span>
            <input
              type="date"
              value={endISO}
              onChange={(e) => setEndISO(e.target.value)}
            />
          </div>
        </div>
      </div>

      {handover.length > 0 ? (
        <div className="cl-section">
          <div className="cl-section-head">
            <h3 className="cl-section-title">Include handover notes?</h3>
          </div>
          <p className="cl-mute" style={{ marginBottom: '0.5rem' }}>
            Tick to include in the printed report. By default none are included — handover is internal.
          </p>
          {handover.map((h) => (
            <label key={h.id} className="cl-card cl-card-tight" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={includedHandoverIds.has(h.id)}
                onChange={() => toggleHandover(h.id)}
              />
              <span style={{ flex: 1, fontSize: '0.875rem' }}>
                <span className="cl-mute" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', marginRight: '0.5rem' }}>
                  {new Date(h.written_at).toLocaleDateString()}
                </span>
                {h.body}
              </span>
            </label>
          ))}
        </div>
      ) : null}

      <div className="cl-section">
        <button
          type="button"
          className="cl-btn"
          data-variant="primary"
          data-size="lg"
          onClick={() => window.print()}
        >
          Print or save as PDF
        </button>
      </div>

      <div className="cl-section">
        <PrintView data={data} recipientName={meta.recipient_name} />
      </div>
    </section>
  );
}
