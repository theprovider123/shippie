/**
 * WeeklySummary — last 7 days of check-ins, plus the notes whose
 * `occurred_at` falls in that window.
 *
 * Charts are <div> bars, not a charting library. Three rows: mood,
 * anxiety, sleep. Days with no check-in get a faint placeholder bar
 * so a missed day is visible without aestheticising the absence.
 */
import { useEffect, useState } from 'react';
import { listCheckinsSince, listNotesInRange, localDateString } from '../db/queries.ts';
import { resolveLocalDb } from '../db/runtime.ts';
import type { Checkin, Note } from '../db/schema.ts';
import { CheckinChart } from '../components/CheckinChart.tsx';
import { NoteList } from '../components/NoteList.tsx';

interface WeeklySummaryProps {
  refreshKey: number;
}

/** Fill in any missing day in [from, today] with placeholder rows. */
function fillWeek(checkins: ReadonlyArray<Checkin>, fromDate: string): Checkin[] {
  const byDay = new Map<string, Checkin>();
  for (const c of checkins) {
    // Last write wins per day; check-ins are normally one per day.
    byDay.set(c.occurred_on, c);
  }
  const out: Checkin[] = [];
  const today = new Date(`${localDateString()}T00:00:00`);
  const start = new Date(`${fromDate}T00:00:00`);
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const key = localDateString(d);
    const existing = byDay.get(key);
    if (existing) {
      out.push(existing);
    } else {
      out.push({
        id: `placeholder-${key}`,
        occurred_on: key,
        mood_1to5: null,
        anxiety_1to5: null,
        sleep_hours: null,
        note: null,
        created_at: '',
      });
    }
  }
  return out;
}

export function WeeklySummary({ refreshKey }: WeeklySummaryProps) {
  const [checkins, setCheckins] = useState<Checkin[] | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = resolveLocalDb();
      const sevenAgo = new Date();
      sevenAgo.setDate(sevenAgo.getDate() - 6);
      const fromDate = localDateString(sevenAgo);
      const since = await listCheckinsSince(db, fromDate);
      const fromIso = new Date(`${fromDate}T00:00:00`).toISOString();
      const toIso = new Date().toISOString();
      const notesInRange = await listNotesInRange(db, fromIso, toIso);
      // Newest first for display, like Home.
      notesInRange.sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
      if (cancelled) return;
      setCheckins(fillWeek(since, fromDate));
      setNotes(notesInRange);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <section className="page page-summary" aria-label="This week">
      <header className="page-header">
        <h1>This week</h1>
      </header>

      {checkins === null || notes === null ? (
        <p className="muted small">Loading.</p>
      ) : (
        <>
          <div className="summary-charts">
            <CheckinChart data={checkins} field="mood_1to5" max={5} label="Mood" />
            <CheckinChart data={checkins} field="anxiety_1to5" max={5} label="Anxiety" />
            <CheckinChart data={checkins} field="sleep_hours" max={12} label="Sleep, hours" />
          </div>

          <div className="summary-notes">
            <h2>Notes</h2>
            <NoteList notes={notes} emptyText="No notes this week." />
          </div>
        </>
      )}
    </section>
  );
}
