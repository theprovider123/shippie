import { useEffect, useState } from 'react';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import type { Stop, TripWithStops } from '../db/schema.ts';
import { getTrip, listStops, deleteStop } from '../db/queries.ts';
import { StopRow } from '../components/StopRow.tsx';

interface Props {
  db: ShippieLocalDb;
  tripId: string;
  onBack: () => void;
  onAddStop: () => void;
}

export function TripPage({ db, tripId, onBack, onAddStop }: Props) {
  const [trip, setTrip] = useState<TripWithStops | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);

  async function refresh() {
    const t = await getTrip(db, tripId);
    setTrip(t);
    setStops(await listStops(db, tripId));
  }

  useEffect(() => {
    void refresh();
  }, [tripId]);

  async function remove(id: string) {
    await deleteStop(db, id);
    await refresh();
  }

  if (!trip) return <p className="atlas-empty">Trip not found.</p>;

  const bbox = computeBBox(stops);

  return (
    <section className="atlas-page">
      <button type="button" className="atlas-btn atlas-btn-ghost" onClick={onBack}>
        ← Trips
      </button>
      <p className="atlas-eyebrow">Trip</p>
      <h2 className="atlas-section-title">{trip.name}</h2>

      {bbox ? (
        <div className="atlas-bbox-preview">
          <p className="atlas-bbox-label">Trip extent</p>
          <p className="atlas-bbox-coords">
            SW: {bbox.south.toFixed(3)}, {bbox.west.toFixed(3)}<br />
            NE: {bbox.north.toFixed(3)}, {bbox.east.toFixed(3)}
          </p>
        </div>
      ) : null}

      <button type="button" className="atlas-btn atlas-btn-primary atlas-btn-block" onClick={onAddStop}>
        Pin a stop
      </button>

      <h2 className="atlas-section-title">Stops</h2>
      {stops.length === 0 ? (
        <p className="atlas-empty">No stops pinned yet.</p>
      ) : (
        <ul className="atlas-list">
          {stops.map((s) => (
            <StopRow key={s.id} stop={s} onDelete={remove} />
          ))}
        </ul>
      )}
    </section>
  );
}

function computeBBox(stops: Stop[]): { north: number; south: number; east: number; west: number } | null {
  if (stops.length === 0) return null;
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;
  for (const s of stops) {
    if (s.lat > north) north = s.lat;
    if (s.lat < south) south = s.lat;
    if (s.lon > east) east = s.lon;
    if (s.lon < west) west = s.lon;
  }
  return { north, south, east, west };
}
