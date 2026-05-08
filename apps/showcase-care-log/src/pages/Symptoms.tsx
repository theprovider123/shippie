/**
 * Symptoms — log a new symptom, view recent log + daily rollup.
 *
 * Quick toggles for common ones (pain, nausea, mood, sleep). Free-text
 * label for anything else. 1-5 intensity is the default scale; "noted"
 * (intensity 0) is the yes/observed sentinel.
 */
import { useState } from 'react';
import type * as Y from 'yjs';
import type { CaregiverRole } from '../sync/pairing.ts';
import {
  logSymptom,
  readMeta,
  readSymptoms,
  type SymptomIntensity,
} from '../sync/care-doc.ts';
import { useYjs } from '../sync/useYjs.ts';
import { SymptomLogRow } from '../components/SymptomLogRow.tsx';
import { groupByDay } from '../lib/symptom-aggregate.ts';
import { emitIntent } from '../app/intents.ts';

interface Props {
  doc: Y.Doc;
  viewer: CaregiverRole;
}

const QUICK_LABELS = ['pain', 'nausea', 'headache', 'fatigue', 'mood', 'sleep'] as const;

export function SymptomsPage({ doc, viewer }: Props) {
  const meta = useYjs(doc, (d) => readMeta(d));
  const all = useYjs(doc, (d) => readSymptoms(d));
  const [label, setLabel] = useState('');
  const [intensity, setIntensity] = useState<SymptomIntensity | 0>(3);
  const [note, setNote] = useState('');

  function submit() {
    const trimmed = label.trim();
    if (!trimmed) return;
    const entry = logSymptom(doc, { label: trimmed, intensity, note }, viewer);
    if (entry) {
      emitIntent('care-symptom-noted', {
        id: entry.id,
        label: entry.label,
        intensity: entry.intensity,
        occurred_at: entry.occurred_at,
        logged_by: viewer,
      });
    }
    setLabel('');
    setIntensity(3);
    setNote('');
  }

  const recent = [...all].sort((a, b) => b.occurred_at - a.occurred_at).slice(0, 30);
  const days = groupByDay(all);
  const recentDays = days.slice(-7);

  return (
    <section>
      <p className="cl-page-eyebrow">Symptoms</p>
      <h2 className="cl-page-title">
        {meta.recipient_name ? `${meta.recipient_name}'s symptoms` : 'Log a symptom'}
      </h2>

      <div className="cl-section">
        <div className="cl-section-head">
          <h3 className="cl-section-title">New symptom</h3>
        </div>

        <div className="cl-card">
          <div className="cl-form-row">
            <span className="cl-form-label">Quick toggles</span>
            <div className="cl-toggle-row">
              {QUICK_LABELS.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="cl-btn"
                  data-size="sm"
                  data-variant={label === q ? 'primary' : undefined}
                  onClick={() => setLabel(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div className="cl-form-row">
            <span className="cl-form-label">Or write something</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="dizziness, agitation, restful afternoon, …"
            />
          </div>

          <div className="cl-form-row">
            <span className="cl-form-label">Intensity</span>
            <div className="cl-toggle-row">
              <button
                type="button"
                className="cl-btn"
                data-size="sm"
                data-variant={intensity === 0 ? 'primary' : undefined}
                onClick={() => setIntensity(0)}
              >
                noted
              </button>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="cl-btn"
                  data-size="sm"
                  data-variant={intensity === n ? 'primary' : undefined}
                  onClick={() => setIntensity(n as SymptomIntensity)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="cl-form-row">
            <span className="cl-form-label">Note (optional)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Started after lunch, eased by 3pm."
            />
          </div>

          <div className="cl-form-actions">
            <button
              type="button"
              className="cl-btn"
              data-variant="primary"
              data-size="lg"
              disabled={!label.trim()}
              onClick={submit}
            >
              Log symptom
            </button>
          </div>
        </div>
      </div>

      <div className="cl-section">
        <div className="cl-section-head">
          <h3 className="cl-section-title">Last 7 days</h3>
        </div>
        {recentDays.length === 0 ? (
          <p className="cl-empty">No symptoms logged in the last week.</p>
        ) : (
          <ul className="cl-day-rollup">
            {recentDays.map((d) => (
              <li key={d.iso} className="cl-card cl-card-tight">
                <div className="cl-row">
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{d.iso}</span>
                  <span className="cl-row-end cl-mute">
                    {d.count} {d.count === 1 ? 'entry' : 'entries'} ·{' '}
                    {[...d.byLabel.keys()].slice(0, 3).join(', ')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="cl-section">
        <div className="cl-section-head">
          <h3 className="cl-section-title">Recent log</h3>
        </div>
        {recent.length === 0 ? (
          <p className="cl-empty">Nothing logged yet.</p>
        ) : (
          recent.map((s) => (
            <SymptomLogRow
              key={s.id}
              entry={s}
              recipientName={meta.recipient_name}
              viewer={viewer}
            />
          ))
        )}
      </div>
    </section>
  );
}
