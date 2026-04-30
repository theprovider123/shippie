import { useState } from 'react';
import type * as Y from 'yjs';
import { ScreenHeader } from '@/components/ScreenHeader.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  addItineraryItem,
  addTripPhoto,
  deleteItineraryItem,
  deleteTrip,
  deleteTripPhoto,
  readTrips,
  setTripPlans,
} from '@/features/schedule/schedule-state.ts';
import { useYjs } from '@/sync/useYjs.ts';
import {
  formatDateLong,
  formatDateShort,
  formatTimeShort,
  toLocalDateString,
} from '@/lib/dates.ts';

interface Props {
  doc: Y.Doc;
  tripId: string;
  onBack: () => void;
}

export function TripDetailPage({ doc, tripId, onBack }: Props) {
  const trips = useYjs(doc, readTrips);
  const trip = trips.find((t) => t.id === tripId);

  if (!trip) {
    return (
      <div className="flex flex-col gap-4 px-4">
        <Button variant="ghost" onClick={onBack}>
          ← Schedule
        </Button>
        <p className="text-[var(--muted-foreground)] text-sm">
          That trip is gone. Maybe deleted on the other phone.
        </p>
      </div>
    );
  }

  const [plansDraft, setPlansDraft] = useState(trip.plans);
  const [savedPlans, setSavedPlans] = useState(false);
  const [newAt, setNewAt] = useState('');
  const [newLabel, setNewLabel] = useState('');

  function savePlans() {
    setTripPlans(doc, trip!.id, plansDraft);
    setSavedPlans(true);
    window.setTimeout(() => setSavedPlans(false), 1200);
  }

  function addItem() {
    if (!newAt || !newLabel.trim()) return;
    addItineraryItem(doc, trip!.id, {
      at: new Date(newAt).toISOString(),
      label: newLabel.trim(),
    });
    setNewAt('');
    setNewLabel('');
  }

  function pickPhoto(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const img = new Image();
      img.onload = () => {
        // Resize to max 1600px on long edge → keep doc reasonable.
        const max = 1600;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          addTripPhoto(doc, trip!.id, canvas.toDataURL('image/jpeg', 0.85));
        } else {
          addTripPhoto(doc, trip!.id, reader.result as string);
        }
      };
      img.onerror = () => addTripPhoto(doc, trip!.id, reader.result as string);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-8">
      <Button variant="ghost" size="sm" onClick={onBack} className="self-start">
        ← Schedule
      </Button>

      <ScreenHeader
        eyebrow="Trip"
        title={`${trip.origin_city} → ${trip.destination_city}`}
        lede={`${formatDateLong(trip.depart_at)} – ${formatDateShort(trip.return_at)}${
          trip.transport ? ` · ${trip.transport}${trip.transport_ref ? ` ${trip.transport_ref}` : ''}` : ''
        }`}
        right={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (window.confirm('Delete this trip?')) {
                deleteTrip(doc, trip.id);
                onBack();
              }
            }}
          >
            Delete
          </Button>
        }
      />

      <Section title="Plans">
        <textarea
          value={plansDraft}
          onChange={(e) => setPlansDraft(e.target.value)}
          rows={5}
          placeholder="What you've talked about, where you might eat, things you don't want to miss."
          className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-serif focus:outline-none focus:border-[var(--gold)] min-h-[120px]"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={savePlans} disabled={plansDraft === trip.plans}>
            {savedPlans ? '✓ saved' : 'Save plans'}
          </Button>
        </div>
      </Section>

      <Section title="Itinerary">
        <ul className="flex flex-col gap-2">
          {trip.itinerary.length === 0 && (
            <li className="text-[var(--muted-foreground)] text-sm">No items yet.</li>
          )}
          {trip.itinerary.map((it) => (
            <li
              key={it.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 flex items-center gap-3"
            >
              <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--gold)] w-24 flex-shrink-0">
                {formatDateShort(it.at)}
                <br />
                {formatTimeShort(it.at)}
              </span>
              <span className="font-serif text-sm flex-1">{it.label}</span>
              <button
                type="button"
                onClick={() => deleteItineraryItem(doc, trip.id, it.id)}
                aria-label="Delete item"
                className="text-[var(--muted-foreground)] hover:text-[var(--destructive)] text-sm"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-col sm:flex-row gap-2 mt-1">
          <input
            type="datetime-local"
            value={newAt}
            min={toLocalDateString(new Date(trip.depart_at)) + 'T00:00'}
            onChange={(e) => setNewAt(e.target.value)}
            className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)] sm:w-52"
          />
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Pick up keys at airport"
            className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
          />
          <Button size="sm" onClick={addItem} disabled={!newAt || !newLabel.trim()}>
            Add
          </Button>
        </div>
      </Section>

      <Section title="Photos">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickPhoto(f);
            e.target.value = '';
          }}
          className="text-xs"
        />
        {trip.photos.length === 0 ? (
          <p className="text-[var(--muted-foreground)] text-sm">No photos yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {trip.photos.map((p, i) => (
              <li key={i} className="relative group">
                <img src={p} alt="" className="w-full aspect-square object-cover rounded-xl" />
                <button
                  type="button"
                  onClick={() => deleteTripPhoto(doc, trip.id, i)}
                  aria-label="Delete photo"
                  className="absolute top-1 right-1 w-7 h-7 rounded-full bg-[var(--background)]/80 text-[var(--foreground)] hover:text-[var(--destructive)] text-sm border border-[var(--border)]"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {trip.notes && (
        <Section title="Notes">
          <p className="font-serif text-base whitespace-pre-wrap">{trip.notes}</p>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 flex flex-col gap-3">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--gold)]">
        {title}
      </h2>
      {children}
    </section>
  );
}
