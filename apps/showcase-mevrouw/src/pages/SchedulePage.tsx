import { useState } from 'react';
import type * as Y from 'yjs';
import { ScreenHeader } from '@/components/ScreenHeader.tsx';
import { Button } from '@/components/ui/button.tsx';
import { TripDetailPage } from './TripDetailPage.tsx';
import {
  meName as resolveMyName,
  partnerOf,
  readCoupleMeta,
} from '@/features/couple/couple-state.ts';
import {
  addTrip,
  deleteTrip,
  readShifts,
  readTrips,
  setShift,
} from '@/features/schedule/schedule-state.ts';
import { useYjs } from '@/sync/useYjs.ts';
import {
  addDays,
  formatDateShort,
  parseLocalDateString,
  startOfWeekMonday,
  toLocalDateString,
} from '@/lib/dates.ts';
import { findMutualFreeDays, type ShiftType } from '@/lib/schedule.ts';
import { cn } from '@/lib/cn.ts';

interface Props {
  doc: Y.Doc;
  myDeviceId: string;
}

const SHIFT_OPTIONS: ReadonlyArray<{ key: NonNullable<ShiftType>; label: string; chip: string }> = [
  { key: 'off', label: 'free', chip: 'F' },
  { key: 'work', label: 'work', chip: 'W' },
  { key: 'half', label: 'half', chip: 'H' },
  { key: 'busy', label: 'busy', chip: 'B' },
];

export function SchedulePage({ doc, myDeviceId }: Props) {
  const meta = useYjs(doc, readCoupleMeta);
  const shifts = useYjs(doc, readShifts);
  const trips = useYjs(doc, readTrips);
  const partner = partnerOf(meta, myDeviceId);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()));
  const [composing, setComposing] = useState(false);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  if (selectedTripId) {
    return (
      <TripDetailPage
        doc={doc}
        tripId={selectedTripId}
        onBack={() => setSelectedTripId(null)}
      />
    );
  }

  const days = Array.from({ length: 14 }, (_, i) => toLocalDateString(addDays(weekStart, i)));

  const userIds = partner ? [myDeviceId, partner.device_id] : [myDeviceId];
  const mutualFree = findMutualFreeDays({
    shifts,
    trips,
    userIds,
    fromDate: toLocalDateString(new Date()),
    limit: 3,
  });

  return (
    <div className="flex flex-col gap-4 px-4">
      <ScreenHeader
        eyebrow="Schedule"
        title="Two weeks ahead."
        lede="Mark off-days. Mutual-free shows up automatically."
        right={
          <Button size="sm" variant="secondary" onClick={() => setComposing(true)}>
            + Trip
          </Button>
        }
      />

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setWeekStart((d) => addDays(d, -7))}
        >
          ← prev
        </Button>
        <span className="font-mono text-xs text-[var(--muted-foreground)] uppercase tracking-wider">
          {formatDateShort(toLocalDateString(weekStart))} —{' '}
          {formatDateShort(toLocalDateString(addDays(weekStart, 13)))}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setWeekStart((d) => addDays(d, 7))}
        >
          next →
        </Button>
      </div>

      {mutualFree.length > 0 && (
        <div className="rounded-2xl p-4 bg-[var(--gold-wash)] border border-[var(--gold-glow)]">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)]">
            Mutual-free
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {mutualFree.map((d) => (
              <li
                key={d}
                className="px-2.5 py-1 rounded-full text-xs font-mono bg-[var(--gold)] text-[var(--background)]"
              >
                {formatDateShort(d)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="flex flex-col gap-1">
        {days.map((date) => {
          const myShift = shifts.find((s) => s.user_id === myDeviceId && s.date === date)?.shift_type ?? null;
          const partnerShift = partner
            ? shifts.find((s) => s.user_id === partner.device_id && s.date === date)?.shift_type ?? null
            : null;
          const tripCovers = trips.find(
            (t) => parseLocalDateString(t.depart_at.slice(0, 10)) <= parseLocalDateString(date) &&
                   parseLocalDateString(t.return_at.slice(0, 10)) >= parseLocalDateString(date),
          );
          const isMutualFree = mutualFree.includes(date);
          const isToday = date === toLocalDateString(new Date());
          return (
            <li
              key={date}
              className={cn(
                'rounded-xl border bg-[var(--card)] px-4 py-3 flex items-center gap-3',
                isMutualFree
                  ? 'border-[var(--gold)]'
                  : isToday
                    ? 'border-[var(--forest-light)]'
                    : 'border-[var(--border)]',
              )}
            >
              <span className="font-mono text-xs text-[var(--muted-foreground)] uppercase tracking-wider w-20">
                {formatDateShort(date)}
              </span>
              <div className="flex-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <ShiftToggle
                  label={resolveMyName(meta, myDeviceId)}
                  current={myShift}
                  onSet={(t) => setShift(doc, myDeviceId, date, t)}
                />
                {partner && (
                  <ShiftToggle
                    label={partner.display_name}
                    current={partnerShift}
                    onSet={(t) => setShift(doc, partner.device_id, date, t)}
                  />
                )}
              </div>
              {tripCovers && (
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)]">
                  trip
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <h2 className="font-serif text-xl mt-4">Trips</h2>
      <ul className="flex flex-col gap-2">
        {trips.length === 0 && (
          <li className="text-[var(--muted-foreground)] text-sm">No trips planned.</li>
        )}
        {trips.map((t) => (
          <li
            key={t.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] flex items-stretch"
          >
            <button
              type="button"
              onClick={() => setSelectedTripId(t.id)}
              className="flex-1 px-4 py-3 text-left flex flex-col gap-1 hover:bg-[var(--forest-light)] active:scale-[0.99] transition-all rounded-l-xl"
            >
              <p className="font-serif text-base">
                {t.origin_city} → {t.destination_city}
              </p>
              <p className="text-[var(--muted-foreground)] text-xs font-mono uppercase tracking-wider">
                {formatDateShort(t.depart_at)} – {formatDateShort(t.return_at)}
                {t.transport ? ` · ${t.transport}` : ''}
                {t.transport_ref ? ` ${t.transport_ref}` : ''}
                {t.itinerary.length > 0 ? ` · ${t.itinerary.length} plan${t.itinerary.length === 1 ? '' : 's'}` : ''}
                {t.photos.length > 0 ? ` · ${t.photos.length} photo${t.photos.length === 1 ? '' : 's'}` : ''}
              </p>
              {t.notes && <p className="text-sm text-[var(--muted-foreground)]">{t.notes}</p>}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                deleteTrip(doc, t.id);
              }}
              aria-label="Delete trip"
              className="px-3 text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {composing && <TripComposer doc={doc} myDeviceId={myDeviceId} onClose={() => setComposing(false)} />}
    </div>
  );
}

function ShiftToggle({
  label,
  current,
  onSet,
}: {
  label: string;
  current: ShiftType;
  onSet: (s: ShiftType) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-[var(--muted-foreground)] font-mono w-12 truncate">
        {label.slice(0, 12).toLowerCase()}
      </span>
      {SHIFT_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onSet(current === opt.key ? null : opt.key)}
          className={cn(
            'w-7 h-7 rounded-md text-[11px] font-mono uppercase border transition-colors',
            current === opt.key
              ? 'bg-[var(--gold)] text-[var(--background)] border-[var(--gold)]'
              : 'bg-transparent text-[var(--muted-foreground)] border-[var(--border)] hover:border-[var(--gold-glow)]',
          )}
          title={opt.label}
        >
          {opt.chip}
        </button>
      ))}
    </div>
  );
}

function TripComposer({ doc, myDeviceId, onClose }: Props & { onClose: () => void }) {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [departAt, setDepartAt] = useState('');
  const [returnAt, setReturnAt] = useState('');
  const [transport, setTransport] = useState('');
  const [notes, setNotes] = useState('');

  const canSave = origin && destination && departAt && returnAt;

  function save() {
    if (!canSave) return;
    addTrip(doc, {
      traveller_id: myDeviceId,
      origin_city: origin.trim(),
      destination_city: destination.trim(),
      depart_at: new Date(departAt).toISOString(),
      return_at: new Date(returnAt).toISOString(),
      transport: transport.trim() || null,
      transport_ref: null,
      notes: notes.trim() || null,
      is_anniversary_flag: false,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-[var(--background)]/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-3xl p-5 flex flex-col gap-3">
        <h3 className="font-serif text-xl">New trip</h3>
        <Field label="Origin">
          <input className={inputClass} value={origin} onChange={(e) => setOrigin(e.target.value)} />
        </Field>
        <Field label="Destination">
          <input
            className={inputClass}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Depart">
            <input
              className={inputClass}
              type="datetime-local"
              value={departAt}
              onChange={(e) => setDepartAt(e.target.value)}
            />
          </Field>
          <Field label="Return">
            <input
              className={inputClass}
              type="datetime-local"
              value={returnAt}
              onChange={(e) => setReturnAt(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Transport (optional)">
          <input
            className={inputClass}
            placeholder="train, plane…"
            value={transport}
            onChange={(e) => setTransport(e.target.value)}
          />
        </Field>
        <Field label="Notes">
          <textarea
            className={cn(inputClass, 'min-h-[60px]')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!canSave} onClick={save}>
            Save trip
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-foreground)]">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--gold)]';
