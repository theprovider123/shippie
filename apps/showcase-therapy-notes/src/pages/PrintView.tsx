/**
 * PrintView — what the therapist actually sees on paper.
 *
 * Plain. Chronological. Headed by date. Not aestheticised. We use
 * the browser's native print() so the user gets a real PDF via
 * "Save as PDF" — no PDF library, no surprise rendering glitches,
 * no asset that fails to load offline.
 */
import { useEffect, useState } from 'react';
import {
  getLatestPrepList,
  listCheckinsSince,
  listNotesInRange,
  localDateString,
} from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import type { Checkin, Note, PrepList } from '../db/schema.ts';

interface PrintViewProps {
  /** Days back from today to include. Default 14. */
  windowDays?: number;
  onClose: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatDay(yyyymmdd: string): string {
  const d = new Date(`${yyyymmdd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return yyyymmdd;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function PrintView({ windowDays = 14, onClose }: PrintViewProps) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [checkins, setCheckins] = useState<Checkin[] | null>(null);
  const [prep, setPrep] = useState<PrepList | null>(null);
  const [range, setRange] = useState<{ from: string; to: string }>({
    from: '',
    to: '',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = resolveLocalDb();
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - (windowDays - 1));
      const fromYmd = localDateString(fromDate);
      const toYmd = localDateString();
      const fromIso = new Date(`${fromYmd}T00:00:00`).toISOString();
      const toIso = new Date().toISOString();
      const [notesRows, checkinRows, prepRow] = await Promise.all([
        listNotesInRange(db, fromIso, toIso),
        listCheckinsSince(db, fromYmd),
        getLatestPrepList(db),
      ]);
      if (cancelled) return;
      // Chronological for therapy print.
      notesRows.sort((a, b) => (a.occurred_at < b.occurred_at ? -1 : 1));
      setNotes(notesRows);
      setCheckins(checkinRows);
      setPrep(prepRow);
      setRange({ from: fromYmd, to: toYmd });
    })();
    return () => {
      cancelled = true;
    };
  }, [windowDays]);

  function doPrint(): void {
    if (typeof window !== 'undefined') window.print();
  }

  if (notes === null || checkins === null) {
    return (
      <section className="page page-print" aria-label="Print preview">
        <p className="muted small">Loading.</p>
      </section>
    );
  }

  return (
    <section className="page page-print" aria-label="Print preview">
      <div className="print-toolbar no-print">
        <button type="button" className="ghost" onClick={onClose}>
          Back
        </button>
        <button type="button" className="primary" onClick={doPrint}>
          Save PDF for session
        </button>
      </div>

      <article className="print-doc">
        <header className="print-header">
          <h1>Therapy notes</h1>
          <p className="print-range">
            {range.from} — {range.to}
          </p>
        </header>

        {prep && prep.body_md.trim() ? (
          <section className="print-section">
            <h2>For this session</h2>
            {prep.label ? <p className="print-label">{prep.label}</p> : null}
            <pre className="print-body">{prep.body_md}</pre>
          </section>
        ) : null}

        <section className="print-section">
          <h2>Daily check-ins</h2>
          {checkins.length === 0 ? (
            <p className="print-muted">No check-ins in this window.</p>
          ) : (
            <table className="print-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Mood (1-5)</th>
                  <th>Anxiety (1-5)</th>
                  <th>Sleep (h)</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {checkins.map((c) => (
                  <tr key={c.id}>
                    <td>{formatDay(c.occurred_on)}</td>
                    <td>{c.mood_1to5 ?? '—'}</td>
                    <td>{c.anxiety_1to5 ?? '—'}</td>
                    <td>{c.sleep_hours ?? '—'}</td>
                    <td>{c.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="print-section">
          <h2>Notes</h2>
          {notes.length === 0 ? (
            <p className="print-muted">No notes in this window.</p>
          ) : (
            notes.map((n) => (
              <article key={n.id} className="print-note">
                <header>
                  <h3>{n.title || 'Note'}</h3>
                  <p className="print-note-date">{formatDate(n.occurred_at)}</p>
                </header>
                <pre className="print-body">{n.body_md}</pre>
              </article>
            ))
          )}
        </section>

        <footer className="print-footer">
          <p>Therapy Notes — printed from a single device. No copy was sent off-device.</p>
        </footer>
      </article>
    </section>
  );
}
