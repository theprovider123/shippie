import { useEffect, useState } from 'react';
import { computeTrend, type Measurement } from './trend.ts';
import { deletePhoto, loadPhoto, savePhoto } from './photo-store.ts';

interface Entry extends Measurement {
  id: string;
  bodyFatPct?: number;
  photoLocalId?: string;
}

const STORAGE_KEY = 'shippie.body-metrics.v1';

function load(): Entry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Entry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function App() {
  const [entries, setEntries] = useState<Entry[]>(() => load());
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [weight, setWeight] = useState<string>('');
  const [bodyFat, setBodyFat] = useState<string>('');
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  // Lazy-load photo blobs into object URLs for visible entries.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const urls: Record<string, string> = {};
      for (const e of entries.slice(0, 5)) {
        if (!e.photoLocalId) continue;
        const blob = await loadPhoto(e.photoLocalId).catch(() => null);
        if (blob) urls[e.photoLocalId] = URL.createObjectURL(blob);
      }
      if (!cancelled) setPhotoUrls(urls);
    })();
    return () => {
      cancelled = true;
      for (const url of Object.values(photoUrls)) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  const trend = computeTrend(entries);

  async function logEntry(e: React.FormEvent) {
    e.preventDefault();
    const weightKg = parseFloat(weight);
    if (!Number.isFinite(weightKg) || weightKg <= 0) return;
    const id = `e_${Date.now()}`;
    const fileInput = document.getElementById('photo') as HTMLInputElement | null;
    let photoLocalId: string | undefined;
    if (fileInput?.files?.[0]) {
      photoLocalId = `p_${Date.now()}`;
      await savePhoto(photoLocalId, fileInput.files[0]);
    }
    const entry: Entry = {
      id,
      date,
      weightKg,
      bodyFatPct: bodyFat ? parseFloat(bodyFat) : undefined,
      photoLocalId,
    };
    setEntries((prev) => [entry, ...prev.filter((x) => x.date !== date)]);
    setWeight('');
    setBodyFat('');
    if (fileInput) fileInput.value = '';
  }

  async function remove(entry: Entry) {
    if (entry.photoLocalId) await deletePhoto(entry.photoLocalId).catch(() => undefined);
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
  }

  return (
    <main>
      <header>
        <h1>Body</h1>
        <p>{entries.length} entr{entries.length === 1 ? 'y' : 'ies'} on this device</p>
      </header>

      <section className="privacy">
        <strong>Photos stay on this device.</strong> They're stored in IndexedDB only — no upload path exists. Delete on this phone deletes them everywhere.
      </section>

      {trend && (
        <section className="trend" data-trend={trend.trend}>
          <strong>Trend:</strong> {trend.trend}
          <span className="rate">{trend.slope > 0 ? '+' : ''}{(trend.slope * 7).toFixed(2)} kg / week</span>
        </section>
      )}

      <form onSubmit={logEntry}>
        <div className="row">
          <label>
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            <span>Weight (kg)</span>
            <input
              type="number"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="74.0"
            />
          </label>
          <label>
            <span>Body fat % (optional)</span>
            <input
              type="number"
              step="0.1"
              value={bodyFat}
              onChange={(e) => setBodyFat(e.target.value)}
              placeholder="18.5"
            />
          </label>
        </div>
        <label>
          <span>Photo (stays on device)</span>
          <input id="photo" type="file" accept="image/*" capture="user" />
        </label>
        <button type="submit" disabled={!weight}>Log</button>
      </form>

      <section>
        <h2>Recent</h2>
        {entries.length === 0 ? (
          <p className="empty">Log a measurement above. After 7 entries we'll show the trend.</p>
        ) : (
          <ul>
            {entries.slice(0, 12).map((e) => (
              <li key={e.id}>
                <div className="meta">
                  <strong>{e.date}</strong>
                  <small>
                    {e.weightKg.toFixed(1)} kg
                    {e.bodyFatPct ? ` · ${e.bodyFatPct.toFixed(1)}% bf` : ''}
                  </small>
                </div>
                {e.photoLocalId && photoUrls[e.photoLocalId] && (
                  <img src={photoUrls[e.photoLocalId]} alt={`Body photo ${e.date}`} />
                )}
                <button onClick={() => remove(e)} aria-label={`Remove ${e.date}`}>×</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
