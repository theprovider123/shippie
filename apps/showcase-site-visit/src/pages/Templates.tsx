/**
 * Templates page. Two sections: built-in (read-only) and saved by you.
 * Saved templates are derived from a current visit's checklist or
 * typed in fresh. The point isn't to match SafetyCulture's library —
 * it's to let one inspector save the five lists they actually use.
 */

import { useState } from 'react';
import { TEMPLATES } from '../lib/templates.ts';
import type { SavedTemplate } from '../db/schema.ts';

export interface TemplatesPageProps {
  saved: ReadonlyArray<SavedTemplate>;
  onSave: (input: { name: string; checks: string[] }) => void;
  onDelete: (id: string) => void;
}

export function TemplatesPage({ saved, onSave, onDelete }: TemplatesPageProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [text, setText] = useState('');

  function reset() {
    setName('');
    setText('');
    setAdding(false);
  }

  function save() {
    const lines = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!name.trim() || lines.length === 0) return;
    onSave({ name: name.trim(), checks: lines });
    reset();
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Templates</h1>
      </header>

      <section className="page-section">
        <h2 className="page-section__title">built-in</h2>
        <ul className="template-list">
          {TEMPLATES.map((t) => (
            <li key={t.id} className="template-row">
              <div className="template-row__head">
                <strong>{t.name}</strong>
                <span className="muted">{t.checks.length} checks</span>
              </div>
              <p className="muted">{t.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="page-section">
        <div className="page-section__head-row">
          <h2 className="page-section__title">your templates</h2>
          {!adding ? (
            <button type="button" className="link-button" onClick={() => setAdding(true)}>
              + new
            </button>
          ) : null}
        </div>

        {adding ? (
          <div className="form-card">
            <input
              className="text-input"
              placeholder="template name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <textarea
              className="text-input"
              rows={6}
              placeholder={'one check per line\nemergency lighting\nfire door\nextinguisher tag'}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="form-card__actions">
              <button type="button" className="link-button" onClick={reset}>
                cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={!name.trim() || !text.trim()}
                onClick={save}
              >
                save template
              </button>
            </div>
          </div>
        ) : null}

        {saved.length === 0 ? (
          <p className="empty-state">Nothing saved yet — add your own list above.</p>
        ) : (
          <ul className="template-list">
            {saved.map((t) => (
              <li key={t.id} className="template-row">
                <div className="template-row__head">
                  <strong>{t.name}</strong>
                  <button
                    type="button"
                    className="link-button danger"
                    onClick={() => onDelete(t.id)}
                  >
                    remove
                  </button>
                </div>
                <p className="muted">{t.checks.length} checks</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
