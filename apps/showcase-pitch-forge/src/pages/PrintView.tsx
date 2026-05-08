import { useEffect } from 'react';
import { renderMarkdown } from '../lib/markdown.ts';
import type { Identity, Pitch, Section } from '../lib/store.ts';
import { PITCH_TYPE_LABEL } from '../lib/templates.ts';

export interface PrintViewPageProps {
  pitch: Pitch;
  sections: Section[];
  identity: Identity;
  onClose: () => void;
}

/**
 * Print-CSS view. The `@media print` rules in styles.css hide the
 * controls and lay sections out one-after-another. The user taps
 * "Print" → the browser's native print dialog has a "Save as PDF"
 * option on every modern OS.
 */
export function PrintViewPage({ pitch, sections, identity, onClose }: PrintViewPageProps) {
  useEffect(() => {
    document.body.classList.add('printable');
    return () => {
      document.body.classList.remove('printable');
    };
  }, []);

  const ordered = [...sections].sort((a, b) => a.order - b.order);

  return (
    <section className="print-view">
      <header className="print-controls no-print">
        <button type="button" className="ghost" onClick={onClose}>
          ← Back
        </button>
        <button type="button" className="primary" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </header>

      <article className="print-doc">
        <section className="print-cover">
          <p className="print-eyebrow">{PITCH_TYPE_LABEL[pitch.type]}</p>
          <h1 className="print-title">{pitch.title || 'Untitled pitch'}</h1>
          {pitch.target ? <p className="print-target">For {pitch.target}</p> : null}
          {pitch.deadline ? <p className="print-deadline">Deadline · {pitch.deadline}</p> : null}
          <hr />
          {identity.name || identity.role || identity.org ? (
            <p className="print-from">
              From {identity.name}
              {identity.role ? `, ${identity.role}` : ''}
              {identity.org ? ` · ${identity.org}` : ''}
              {identity.email ? ` · ${identity.email}` : ''}
            </p>
          ) : null}
        </section>

        {ordered.map((s) => (
          <section key={s.id} className="print-section">
            <h2>{s.title}</h2>
            <div
              className="print-body"
              // renderMarkdown is XSS-safe by construction; see markdown.test.ts.
              dangerouslySetInnerHTML={{ __html: renderMarkdown(s.body_md) }}
            />
          </section>
        ))}
      </article>
    </section>
  );
}
