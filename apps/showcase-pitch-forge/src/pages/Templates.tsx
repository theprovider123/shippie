import { BUILTIN_TEMPLATES } from '../lib/templates.ts';

export interface TemplatesPageProps {
  onBack: () => void;
}

/**
 * Read-only template catalogue. The user picks a template at pitch
 * creation time; this page just lets them inspect what's included.
 *
 * Custom user-defined templates aren't shipped in the v1 — once the
 * user has 5+ pitches we can mine them for repeated section shapes
 * and offer "save as template", but that's a follow-up.
 */
export function TemplatesPage({ onBack }: TemplatesPageProps) {
  return (
    <section className="page">
      <header className="page-header">
        <button type="button" className="ghost" onClick={onBack}>
          ← Back
        </button>
        <h2>Templates</h2>
      </header>
      <p className="muted small">
        These are the starting shapes for new pitches. Pick one when you create a pitch — sections are editable after.
      </p>
      <ul className="template-catalogue">
        {BUILTIN_TEMPLATES.map((t) => (
          <li key={t.type} className="template-entry">
            <h3>{t.name}</h3>
            <p className="muted">{t.description}</p>
            <ol className="template-section-list">
              {t.sections.map((s) => (
                <li key={s.kind + s.title}>
                  <strong>{s.title}</strong>
                  <span className="muted small"> · {s.hint}</span>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </section>
  );
}
