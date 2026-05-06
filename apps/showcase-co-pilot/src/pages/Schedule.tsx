/**
 * Schedule — week view. Tap a day → swap "with parent" or add a note.
 *
 * Voice rules: never characterise the other parent. The two states
 * are "with you" and "with the other parent".
 */
import { useState } from 'react';
import type * as Y from 'yjs';
import type { ParentRole } from '../sync/pairing.ts';
import {
  readScheduleDay,
  setScheduleDay,
  setScheduleNote,
  startOfWeekISO,
} from '../sync/coparent-doc.ts';
import { useYjs } from '../sync/useYjs.ts';
import { ScheduleCell } from '../components/ScheduleCell.tsx';
import { buildWeek, shiftWeek, formatDateLong } from '../state/schedule.ts';
import { emitIntent } from '../app/intents.ts';

interface Props {
  doc: Y.Doc;
  viewer: ParentRole;
}

function startOfWeekDate(now: Date = new Date()): Date {
  const iso = startOfWeekISO(now);
  return new Date(iso + 'T00:00:00');
}

export function SchedulePage({ doc, viewer }: Props) {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekDate());
  const [selectedISO, setSelectedISO] = useState<string | null>(null);

  const week = buildWeek(weekStart);
  // Force re-render on doc updates by reading something cheap.
  const _v = useYjs(doc, (d) => d.getMap('schedule').size);
  void _v;

  function moveWeek(delta: number) {
    setWeekStart(shiftWeek(weekStart, delta));
    setSelectedISO(null);
  }

  function rangeLabel(): string {
    const last = week[week.length - 1]?.date ?? weekStart;
    return `${week[0]?.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${last.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }

  return (
    <section>
      <p className="co-page-eyebrow">Schedule</p>
      <h2 className="co-page-title">Whose week is this.</h2>

      <div className="co-week-controls">
        <button
          type="button"
          className="co-btn"
          data-size="sm"
          data-variant="ghost"
          onClick={() => moveWeek(-1)}
          aria-label="Previous week"
        >
          ← Prev
        </button>
        <span className="co-week-label">{rangeLabel()}</span>
        <button
          type="button"
          className="co-btn"
          data-size="sm"
          data-variant="ghost"
          onClick={() => moveWeek(1)}
          aria-label="Next week"
        >
          Next →
        </button>
      </div>

      <div className="co-week-grid">
        {week.map((day) => (
          <ScheduleCell
            key={day.iso}
            day={day}
            schedule={readScheduleDay(doc, day.iso)}
            viewer={viewer}
            onSelect={setSelectedISO}
          />
        ))}
      </div>

      {selectedISO ? (
        <DayEditor
          doc={doc}
          viewer={viewer}
          isoDate={selectedISO}
          onClose={() => setSelectedISO(null)}
        />
      ) : (
        <p className="co-empty">Tap a day to set it.</p>
      )}
    </section>
  );
}

function DayEditor({
  doc,
  viewer,
  isoDate,
  onClose,
}: {
  doc: Y.Doc;
  viewer: ParentRole;
  isoDate: string;
  onClose: () => void;
}) {
  const day = useYjs(doc, (d) => readScheduleDay(d, isoDate));
  const date = new Date(isoDate + 'T00:00:00');
  const [noteDraft, setNoteDraft] = useState(day?.note ?? '');

  function setWith(role: ParentRole) {
    setScheduleDay(doc, isoDate, role);
    emitIntent('coparent-day-changed', { iso: isoDate, with_parent: role });
  }

  function saveNote() {
    setScheduleNote(doc, isoDate, noteDraft);
  }

  return (
    <div className="co-card">
      <div className="co-section-head">
        <h3 className="co-section-title">{formatDateLong(date)}</h3>
        <button type="button" className="co-btn" data-size="sm" data-variant="ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="co-form-row">
        <span className="co-form-label">With which parent</span>
        <div className="co-row" style={{ gap: '0.5rem' }}>
          <button
            type="button"
            className="co-btn"
            data-variant={day?.with_parent === viewer ? 'primary' : undefined}
            data-size="sm"
            onClick={() => setWith(viewer)}
          >
            You
          </button>
          <button
            type="button"
            className="co-btn"
            data-variant={day && day.with_parent !== viewer ? 'primary' : undefined}
            data-size="sm"
            onClick={() => setWith(viewer === 'a' ? 'b' : 'a')}
          >
            Other parent
          </button>
        </div>
      </div>
      <div className="co-form-row">
        <span className="co-form-label">Note for this day</span>
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="School trip Friday, swimming kit needed."
        />
        <div className="co-form-actions">
          <button type="button" className="co-btn" data-size="sm" onClick={saveNote}>
            Save note
          </button>
        </div>
      </div>
    </div>
  );
}
