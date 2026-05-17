/**
 * NewNote — the picker. Three template options plus a blank page.
 * Voice: each option is offered, never assigned. The first option
 * ("Just a blank page") is deliberately the most honest one.
 */
import { useState } from 'react';
import { createNote } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import { TEMPLATES } from '../templates/index.ts';
import type { WorksheetTemplate } from '../templates/types.ts';
import { Worksheet } from '../components/Worksheet.tsx';

interface NewNoteProps {
  onSaved: () => void;
  onCancel: () => void;
}

type Mode = 'pick' | 'free' | { kind: 'worksheet'; template: WorksheetTemplate };

export function NewNote({ onSaved, onCancel }: NewNoteProps) {
  const [mode, setMode] = useState<Mode>('pick');
  const [freeTitle, setFreeTitle] = useState('');
  const [freeBody, setFreeBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveFree(): Promise<void> {
    if (!freeBody.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createNote(resolveLocalDb(), {
        kind: 'free',
        title: freeTitle.trim() || null,
        body_md: freeBody.trim(),
      });
      onSaved();
    } catch {
      setError('Couldn\'t save just now. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function saveWorksheet(result: { title: string; body_md: string; kind: WorksheetTemplate['kind'] }): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await createNote(resolveLocalDb(), {
        kind: result.kind,
        title: result.title,
        body_md: result.body_md,
      });
      onSaved();
    } catch {
      setError('Couldn\'t save just now. Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (mode === 'pick') {
    return (
      <section className="page page-picker" aria-label="New note">
        <header className="page-header">
          <h1>What kind?</h1>
        </header>
        <ul className="picker-list">
          <li>
            <button type="button" className="picker-card" onClick={() => setMode('free')}>
              <span className="picker-card-title">Just a blank page</span>
              <span className="picker-card-sub">Write whatever. No template.</span>
            </button>
          </li>
          {TEMPLATES.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="picker-card"
                onClick={() => setMode({ kind: 'worksheet', template: t })}
              >
                <span className="picker-card-title">Try a {t.title.toLowerCase()}</span>
                <span className="picker-card-sub">{t.subtitle}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="page-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            Back
          </button>
        </div>
      </section>
    );
  }

  if (mode === 'free') {
    return (
      <section className="page page-free" aria-label="New note">
        <header className="page-header">
          <h1>Note something</h1>
        </header>
        <input
          type="text"
          className="text-input title-input"
          placeholder="Title (optional)"
          value={freeTitle}
          onChange={(e) => setFreeTitle(e.target.value)}
        />
        <textarea
          className="textarea-input free-body"
          rows={14}
          placeholder=""
          value={freeBody}
          onChange={(e) => setFreeBody(e.target.value)}
          aria-label="Note body"
        />
        {error ? <p className="error-line">{error}</p> : null}
        <div className="page-actions">
          <button type="button" className="ghost" onClick={() => setMode('pick')} disabled={saving}>
            Back
          </button>
          <button type="button" className="primary" onClick={saveFree} disabled={saving || !freeBody.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="page page-worksheet">
      <Worksheet
        template={mode.template}
        onDone={saveWorksheet}
        onCancel={() => setMode('pick')}
        saving={saving}
      />
      {error ? <p className="error-line">{error}</p> : null}
    </section>
  );
}
