import { useEffect, useState } from 'react';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import type { Trip } from '../db/schema.ts';
import { listTrips, createTrip, endTrip, deleteTrip } from '../db/queries.ts';
import { emitIntent } from '../app/intents.ts';

interface Props {
  db: ShippieLocalDb;
  onOpen: (tripId: string) => void;
}

export function TripsPage({ db, onOpen }: Props) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [name, setName] = useState('');

  async function refresh() {
    setTrips(await listTrips(db));
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function start() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const trip = await createTrip(db, { name: trimmed });
    emitIntent('trip-started', { id: trip.id, name: trip.name });
    setName('');
    await refresh();
  }

  async function close(tripId: string) {
    await endTrip(db, tripId);
    emitIntent('trip-ended', { id: tripId });
    await refresh();
  }

  async function remove(tripId: string) {
    await deleteTrip(db, tripId);
    await refresh();
  }

  const active = trips.filter((t) => !t.ended_on);
  const past = trips.filter((t) => !!t.ended_on);

  return (
    <section className="atlas-page">
      <p className="atlas-eyebrow">Trips</p>

      <h2 className="atlas-section-title">Start a new trip</h2>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Lake District weekend"
        className="atlas-input"
      />
      <button type="button" className="atlas-btn atlas-btn-primary" disabled={!name.trim()} onClick={start}>
        Start trip
      </button>

      <h2 className="atlas-section-title">Active</h2>
      {active.length === 0 ? (
        <p className="atlas-empty">No trips right now.</p>
      ) : (
        <ul className="atlas-list">
          {active.map((t) => (
            <li key={t.id}>
              <button type="button" className="atlas-trip-row" onClick={() => onOpen(t.id)}>
                <strong>{t.name}</strong>
                <span className="atlas-trip-meta">started {t.started_on ? new Date(t.started_on).toLocaleDateString() : '—'}</span>
              </button>
              <button type="button" className="atlas-btn atlas-btn-ghost" onClick={() => close(t.id)}>
                End
              </button>
            </li>
          ))}
        </ul>
      )}

      <h2 className="atlas-section-title">Past</h2>
      {past.length === 0 ? (
        <p className="atlas-empty">No past trips yet.</p>
      ) : (
        <ul className="atlas-list">
          {past.map((t) => (
            <li key={t.id}>
              <button type="button" className="atlas-trip-row" onClick={() => onOpen(t.id)}>
                <strong>{t.name}</strong>
                <span className="atlas-trip-meta">
                  {t.started_on ? new Date(t.started_on).toLocaleDateString() : '—'} —{' '}
                  {t.ended_on ? new Date(t.ended_on).toLocaleDateString() : '—'}
                </span>
              </button>
              <button type="button" className="atlas-btn atlas-btn-ghost" onClick={() => remove(t.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
