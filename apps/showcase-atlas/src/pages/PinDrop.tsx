import { useEffect, useState } from 'react';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import type { Trip } from '../db/schema.ts';
import { listTrips, pinStop } from '../db/queries.ts';
import { emitIntent } from '../app/intents.ts';

interface Props {
  db: ShippieLocalDb;
  onPinned: (tripId: string) => void;
}

export function PinDropPage({ db, onPinned }: Props) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripId, setTripId] = useState<string>('');
  const [lat, setLat] = useState<string>('');
  const [lon, setLon] = useState<string>('');
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const t = await listTrips(db);
      const open = t.filter((x) => !x.ended_on);
      setTrips(open);
      if (open.length > 0 && !tripId) setTripId(open[0]!.id);
    })();
  }, []);

  function captureGps() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError("This browser doesn't expose location. Type lat/lon manually below.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLon(pos.coords.longitude.toFixed(6));
        setBusy(false);
        setError(null);
      },
      (err) => {
        setBusy(false);
        setError(`Couldn't read your location: ${err.message}. Type it in below.`);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function save() {
    setError(null);
    const latN = Number.parseFloat(lat);
    const lonN = Number.parseFloat(lon);
    if (!Number.isFinite(latN) || latN < -90 || latN > 90) {
      setError('Latitude is a number between -90 and 90.');
      return;
    }
    if (!Number.isFinite(lonN) || lonN < -180 || lonN > 180) {
      setError('Longitude is a number between -180 and 180.');
      return;
    }
    if (!tripId) {
      setError('Pick or start a trip first.');
      return;
    }
    const stop = await pinStop(db, {
      trip_id: tripId,
      lat: latN,
      lon: lonN,
      label: label.trim() || undefined,
      note: note.trim() || undefined,
    });
    emitIntent('stop-pinned', { id: stop.id, trip_id: tripId, lat: stop.lat, lon: stop.lon });
    onPinned(tripId);
  }

  return (
    <section className="atlas-page">
      <p className="atlas-eyebrow">Pin</p>
      <h2 className="atlas-section-title">Where are we?</h2>

      {trips.length === 0 ? (
        <p className="atlas-empty">No active trip. Start one in Trips first.</p>
      ) : (
        <>
          <label className="atlas-label">
            Trip
            <select value={tripId} onChange={(e) => setTripId(e.target.value)} className="atlas-input">
              {trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>

          <button type="button" className="atlas-btn" disabled={busy} onClick={captureGps}>
            {busy ? 'Reading GPS…' : 'Use current location'}
          </button>

          <div className="atlas-row">
            <label className="atlas-label">
              Latitude
              <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="51.5074" className="atlas-input" />
            </label>
            <label className="atlas-label">
              Longitude
              <input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="-0.1278" className="atlas-input" />
            </label>
          </div>

          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. trailhead, gate B)" className="atlas-input" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="A note worth remembering." />

          {error ? <p className="atlas-error">{error}</p> : null}

          <button type="button" className="atlas-btn atlas-btn-primary atlas-btn-block" onClick={save}>
            Pin this spot
          </button>
        </>
      )}
    </section>
  );
}
