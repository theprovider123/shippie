/**
 * PrepForSession — drafts a list of bullets the user wants to bring
 * into the next session. Stored as a single PrepList row that can be
 * edited; "Save PDF for session" routes to PrintView.
 */
import { useEffect, useRef, useState } from 'react';
import {
  createPrepList,
  getLatestPrepList,
  updatePrepList,
} from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import type { PrepList } from '../db/schema.ts';

interface PrepForSessionProps {
  refreshKey: number;
  onPrint: () => void;
}

const SAMPLE_PROMPTS: ReadonlyArray<string> = [
  'Something I noticed this week.',
  'A pattern I want to check.',
  'A question I forgot to ask last time.',
];

export function PrepForSession({ refreshKey, onPrint }: PrepForSessionProps) {
  const [body, setBody] = useState('');
  const [label, setLabel] = useState('');
  const [existing, setExisting] = useState<PrepList | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const latest = await getLatestPrepList(resolveLocalDb());
      if (cancelled) return;
      setExisting(latest);
      if (latest) {
        setBody(latest.body_md);
        setLabel(latest.label ?? '');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  function scheduleSave(nextBody: string, nextLabel: string): void {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void persist(nextBody, nextLabel);
    }, 500);
  }

  async function persist(nextBody: string, nextLabel: string): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const db = resolveLocalDb();
      const trimmedBody = nextBody;
      const trimmedLabel = nextLabel.trim();
      if (existing) {
        await updatePrepList(db, existing.id, {
          body_md: trimmedBody,
          label: trimmedLabel || null,
          occurred_at: new Date().toISOString(),
        });
      } else if (trimmedBody.trim()) {
        const created = await createPrepList(db, {
          body_md: trimmedBody,
          label: trimmedLabel || null,
        });
        setExisting(created);
      }
      setSavedAt(Date.now());
    } catch {
      setError('Couldn\'t save just now. Try again.');
    } finally {
      setSaving(false);
    }
  }

  function appendBullet(text: string): void {
    const next = `${body.replace(/\s*$/, '')}\n- ${text}`.replace(/^\n/, '');
    setBody(next);
    scheduleSave(next, label);
  }

  return (
    <section className="page page-prep" aria-label="Prep for session">
      <header className="page-header">
        <h1>For next session</h1>
        <p className="muted small">A short list. The therapist reads what you write.</p>
      </header>

      <label className="field">
        <span className="field-prompt">When (optional)</span>
        <input
          type="text"
          className="text-input"
          placeholder="e.g. Tuesday 10:00"
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            scheduleSave(body, e.target.value);
          }}
        />
      </label>

      <label className="field">
        <span className="field-prompt">Bullets</span>
        <textarea
          className="textarea-input"
          rows={10}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            scheduleSave(e.target.value, label);
          }}
          placeholder="- Something I noticed this week."
        />
      </label>

      <div className="prep-suggestions">
        <p className="muted small">Quick add:</p>
        <div className="chip-row">
          {SAMPLE_PROMPTS.map((p) => (
            <button key={p} type="button" className="chip" onClick={() => appendBullet(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="page-actions">
        <span className="muted small save-state" aria-live="polite">
          {error ? error : saving ? 'Saving…' : savedAt ? 'Saved.' : ' '}
        </span>
        <button type="button" className="primary" onClick={onPrint} disabled={!body.trim()}>
          Save PDF for session
        </button>
      </div>
    </section>
  );
}
