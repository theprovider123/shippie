/**
 * Print-CSS view. Layout aimed at A4 with reasonable margins. Headers
 * + section labels + checklist with status pills + signatures +
 * incidents — everything a property manager needs in their inbox.
 *
 * `window.print()` from the parent triggers Save-as-PDF on iOS/Android
 * and the printer dialog on desktop. We don't fight the OS — we just
 * lay it out and let the OS do PDF generation.
 */

import { useEffect, useState } from 'react';
import type { ShippieLocalFiles } from '@shippie/local-runtime-contract';
import type { PdfPayload } from '../lib/pdf-data.ts';
import { summaryHeadline } from '../lib/pdf-data.ts';

export interface PrintViewProps {
  payload: PdfPayload;
  files: ShippieLocalFiles | null;
  onBack: () => void;
}

interface PhotoUrl {
  path: string;
  url: string;
}

function formatTimestamp(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function PrintView({ payload, files, onBack }: PrintViewProps) {
  // Resolve photo paths to object URLs for the print render. We pull
  // every check + incident photo so the PDF carries the evidence
  // inline.
  const allPaths: string[] = [];
  for (const c of payload.checks) {
    // Note: PdfCheck doesn't carry paths; the print view shows photo
    // counts only. (Image inlining for the PDF would require passing
    // the original paths through pdf-data — kept as a follow-up.)
    void c;
  }
  for (const i of payload.incidents) {
    void i;
  }

  const [incidentUrls] = useState<PhotoUrl[]>([]);

  useEffect(() => {
    void files;
    void allPaths;
    return () => {
      for (const u of incidentUrls) URL.revokeObjectURL(u.url);
    };
  }, [files, allPaths, incidentUrls]);

  function print() {
    window.print();
  }

  return (
    <section className="page page--print">
      <header className="page-header no-print">
        <button type="button" className="link-button" onClick={onBack}>
          ← back
        </button>
        <button type="button" className="primary" onClick={print}>
          Save / print PDF
        </button>
      </header>

      <article className="print-doc">
        <header className="print-doc__head">
          <h1>{payload.site.name}</h1>
          {payload.site.address ? <p className="muted">{payload.site.address}</p> : null}
          {payload.site.contact ? <p className="muted">contact · {payload.site.contact}</p> : null}
          <p className="print-doc__meta">
            {formatTimestamp(payload.visit.startedAt)}
            {payload.visit.endedAt ? ` → ${formatTimestamp(payload.visit.endedAt)}` : ''}
            {payload.visit.weather ? ` · ${payload.visit.weather}` : ''}
            {payload.visit.inspectorName ? ` · ${payload.visit.inspectorName}` : ''}
          </p>
          <p className="print-doc__headline">{summaryHeadline(payload)}</p>
        </header>

        <section>
          <h2>Checklist</h2>
          <table className="print-doc__table">
            <thead>
              <tr>
                <th style={{ width: '60%' }}>item</th>
                <th>status</th>
                <th>photos</th>
              </tr>
            </thead>
            <tbody>
              {payload.checks.map((c) => (
                <tr key={c.id} className={`row row--${c.status}`}>
                  <td>
                    <div>{c.label}</div>
                    {c.notes ? <div className="row__notes">{c.notes}</div> : null}
                  </td>
                  <td>{c.statusLabel}</td>
                  <td>{c.photoCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {payload.incidents.length > 0 ? (
          <section>
            <h2>Incidents</h2>
            <ul className="print-doc__incidents">
              {payload.incidents.map((i) => (
                <li key={i.id} className={`row row--${i.severity}`}>
                  <div className="row__head">
                    <strong>{i.severityLabel}</strong>
                    {i.followUp ? <span> · follow-up needed</span> : null}
                  </div>
                  <p>{i.description}</p>
                  {i.hasPhoto ? <p className="row__notes">[photo on record]</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="print-doc__sign-block">
          <h2>Signature</h2>
          {payload.signatureSvg ? (
            <div
              className="print-doc__sig"
              dangerouslySetInnerHTML={{ __html: payload.signatureSvg }}
            />
          ) : (
            <p className="muted">[unsigned]</p>
          )}
          <p className="print-doc__sign-name">{payload.visit.inspectorName || '—'}</p>
          <p className="muted">{payload.visit.statusLabel}</p>
        </section>

        <footer className="print-doc__foot">
          <span>Site Visit · Shippie · created on this device</span>
        </footer>
      </article>
    </section>
  );
}
