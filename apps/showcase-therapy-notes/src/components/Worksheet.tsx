/**
 * Worksheet — renders a template's fields and saves the filled-in
 * markdown to `notes.body_md` on done. Field-level state is local;
 * we don't autosave drafts (a half-finished thought record sitting
 * on disk is its own kind of unhelpful).
 */
import { useState } from 'react';
import type { TemplateValue, TemplateValues, WorksheetTemplate } from '../templates/types.ts';

interface WorksheetProps {
  template: WorksheetTemplate;
  onDone: (result: { title: string; body_md: string; kind: WorksheetTemplate['kind'] }) => void | Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}

export function Worksheet({ template, onDone, onCancel, saving = false }: WorksheetProps) {
  const [values, setValues] = useState<TemplateValues>({});
  const [title, setTitle] = useState<string>('');

  function setField(key: string, value: TemplateValue): void {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function toggleChecklist(key: string, option: string): void {
    setValues((prev) => {
      const cur = Array.isArray(prev[key]) ? (prev[key] as ReadonlyArray<string>) : [];
      const next = cur.includes(option) ? cur.filter((v) => v !== option) : [...cur, option];
      return { ...prev, [key]: next };
    });
  }

  function handleSave(): void {
    const body = template.serialize(values);
    void onDone({
      title: title.trim() || template.defaultTitle,
      body_md: body,
      kind: template.kind,
    });
  }

  return (
    <section className="worksheet" aria-label={template.title}>
      <header className="worksheet-header">
        <h1>{template.title}</h1>
        <p className="muted small">{template.subtitle}</p>
      </header>

      <label className="field">
        <span className="field-prompt">Title</span>
        <input
          type="text"
          className="text-input"
          value={title}
          placeholder={template.defaultTitle}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      {template.fields.map((field) => (
        <div key={field.key} className="field">
          <label htmlFor={`f-${field.key}`} className="field-prompt">
            {field.prompt}
          </label>
          {field.hint ? <p className="field-hint">{field.hint}</p> : null}

          {field.kind === 'short' ? (
            <input
              id={`f-${field.key}`}
              type="text"
              className="text-input"
              value={typeof values[field.key] === 'string' ? (values[field.key] as string) : ''}
              onChange={(e) => setField(field.key, e.target.value)}
            />
          ) : null}

          {field.kind === 'long' ? (
            <textarea
              id={`f-${field.key}`}
              className="textarea-input"
              rows={4}
              value={typeof values[field.key] === 'string' ? (values[field.key] as string) : ''}
              onChange={(e) => setField(field.key, e.target.value)}
            />
          ) : null}

          {field.kind === 'rating' ? (
            <div className="rating-row">
              <input
                id={`f-${field.key}`}
                type="range"
                min={0}
                max={field.ratingMax ?? 10}
                value={typeof values[field.key] === 'number' ? (values[field.key] as number) : 0}
                onChange={(e) => setField(field.key, Number(e.target.value))}
                aria-label={field.prompt}
              />
              <output className="rating-readout">
                {typeof values[field.key] === 'number' ? (values[field.key] as number) : 0}
                {field.ratingUnit ?? ''}
              </output>
            </div>
          ) : null}

          {field.kind === 'checklist' && field.options ? (
            <ul className="checklist">
              {field.options.map((opt) => {
                const cur = Array.isArray(values[field.key])
                  ? (values[field.key] as ReadonlyArray<string>)
                  : [];
                const checked = cur.includes(opt);
                return (
                  <li key={opt}>
                    <label className={`check-item ${checked ? 'check-item-on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleChecklist(field.key, opt)}
                      />
                      <span>{opt}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ))}

      <div className="worksheet-actions">
        <button type="button" className="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </section>
  );
}
