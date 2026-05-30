/**
 * Today's log, grouped by meal slot with times. The per-slot protein
 * readout makes the day's protein distribution visible at a glance —
 * the thing most people under-track.
 */
import type { Entry, Slot } from '../lib/types';
import { SLOTS, SLOT_LABEL } from '../lib/foods-data';
import { totalsForEntries } from '../lib/nutrition';
import { fmt, timeOf } from '../lib/format';

interface Props {
  entries: Entry[];
  onEdit: (entry: Entry) => void;
}

export function MealTimeline({ entries, onEdit }: Props) {
  if (entries.length === 0) {
    return (
      <div className="empty">
        <div className="big">Nothing logged yet</div>
        <div>Add your first thing above — it takes a tap.</div>
      </div>
    );
  }

  const bySlot = new Map<Slot, Entry[]>();
  for (const e of entries) {
    const list = bySlot.get(e.slot) ?? [];
    list.push(e);
    bySlot.set(e.slot, list);
  }

  return (
    <div>
      {SLOTS.filter((s) => bySlot.has(s)).map((slot) => {
        const list = (bySlot.get(slot) ?? []).sort((a, b) => a.logged_at.localeCompare(b.logged_at));
        const totals = totalsForEntries(list);
        return (
          <div className="slot-group" key={slot}>
            <div className="slot-head">
              <span className="name">{SLOT_LABEL[slot]}</span>
              <span className="meta">{fmt(totals.kcal)} kcal · {fmt(totals.protein_g)} g protein</span>
            </div>
            {list.map((e) => (
              <button key={e.id} type="button" className="entry" onClick={() => onEdit(e)} style={{ width: '100%', background: 'transparent', border: 0, textAlign: 'left' }}>
                <span className="time">{timeOf(e.logged_at)}</span>
                <span className="body">
                  <span className="nm">{e.name}</span>
                  <span className="det">
                    {e.grams ? `${fmt(e.grams)} g` : `×${e.qty}`}
                    {e.note ? ` · ${e.note}` : ''}
                  </span>
                </span>
                <span className="kc">{fmt(e.nutrients.kcal)}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
