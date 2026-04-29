import { useEffect, useMemo, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { deletePhoto, loadPhoto, savePhoto } from './photo-store.ts';

const shippie = createShippieIframeSdk({ appId: 'app_restaurant_memory' });

const STORAGE_KEY = 'shippie.restaurant-memory.v1';

interface RestaurantVisit {
  id: string;
  name: string;
  notes?: string;
  rating?: number;
  /** Coordinates if Geolocation was granted at the time of save. */
  coords?: { lat: number; lon: number };
  photoLocalId?: string;
  visitedAt: string;
}

interface PersistedState {
  visits: RestaurantVisit[];
  homeCookedToday: number;
}

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { visits: [], homeCookedToday: 0 };
    const parsed = JSON.parse(raw) as PersistedState;
    return {
      visits: Array.isArray(parsed.visits) ? parsed.visits : [],
      homeCookedToday: typeof parsed.homeCookedToday === 'number' ? parsed.homeCookedToday : 0,
    };
  } catch {
    return { visits: [], homeCookedToday: 0 };
  }
}

function save(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota errors non-fatal */
  }
}

async function getPositionOnce(): Promise<{ lat: number; lon: number } | null> {
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60_000 },
    );
  });
}

export function App() {
  const initial = load();
  const [visits, setVisits] = useState<RestaurantVisit[]>(initial.visits);
  const [homeCooked, setHomeCooked] = useState<number>(initial.homeCookedToday);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState(4);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    save({ visits, homeCookedToday: homeCooked });
  }, [visits, homeCooked]);

  // Subscribe to cooked-meal so the home-vs-out ratio has data.
  useEffect(() => {
    shippie.requestIntent('cooked-meal');
    return shippie.intent.subscribe('cooked-meal', () => {
      setHomeCooked((n) => n + 1);
    });
  }, []);

  // Lazy-load photo blobs into object URLs for visible visits.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const urls: Record<string, string> = {};
      for (const v of visits.slice(0, 10)) {
        if (!v.photoLocalId) continue;
        const blob = await loadPhoto(v.photoLocalId).catch(() => null);
        if (blob) urls[v.photoLocalId] = URL.createObjectURL(blob);
      }
      if (!cancelled) setPhotoUrls(urls);
    })();
    return () => {
      cancelled = true;
      for (const url of Object.values(photoUrls)) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visits.length]);

  async function logVisit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const fileInput = document.getElementById('photo') as HTMLInputElement | null;
    let photoLocalId: string | undefined;
    if (fileInput?.files?.[0]) {
      photoLocalId = `p_${Date.now()}`;
      await savePhoto(photoLocalId, fileInput.files[0]);
    }
    const coords = await getPositionOnce();
    const visit: RestaurantVisit = {
      id: `v_${Date.now()}`,
      name: trimmed,
      notes: notes.trim() || undefined,
      rating,
      coords: coords ?? undefined,
      photoLocalId,
      visitedAt: new Date().toISOString(),
    };
    setVisits((prev) => [visit, ...prev]);
    setName('');
    setNotes('');
    setRating(4);
    if (fileInput) fileInput.value = '';
    shippie.feel.texture('confirm');
    // Provide `dined-out` so other apps (Hydration, Mood Pulse) can
    // react. Coords are NOT in the broadcast — we keep location local.
    shippie.intent.broadcast('dined-out', [
      {
        kind: 'dined-out',
        title: visit.name,
        rating: visit.rating,
        visitedAt: visit.visitedAt,
      },
    ]);
  }

  async function remove(visit: RestaurantVisit) {
    if (visit.photoLocalId) await deletePhoto(visit.photoLocalId).catch(() => undefined);
    setVisits((prev) => prev.filter((v) => v.id !== visit.id));
    shippie.feel.texture('delete');
  }

  const out = visits.length;
  const ratio = useMemo(() => {
    const total = out + homeCooked;
    if (total === 0) return null;
    return Math.round((out / total) * 100);
  }, [out, homeCooked]);

  return (
    <main>
      <div className="privacy-ribbon" role="region">
        <span aria-hidden="true">🔒</span>
        <span>Photos and coordinates stay on this device. The dined-out broadcast carries name + rating only.</span>
      </div>

      <header>
        <h1>Restaurant Memory</h1>
        {ratio !== null ? (
          <p>{ratio}% of meals out · {homeCooked} cooked at home</p>
        ) : (
          <p>Log a visit to see the home-vs-out ratio.</p>
        )}
      </header>

      <form onSubmit={logVisit}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Restaurant name"
          aria-label="Restaurant name"
        />
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What did you order?"
          aria-label="Notes"
        />
        <label className="rating">
          <span>Rating · {rating}/5</span>
          <input
            type="range"
            min={1}
            max={5}
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            aria-label="Rating"
          />
        </label>
        <label className="photo">
          <span>Photo (stays on device)</span>
          <input id="photo" type="file" accept="image/*" capture="environment" />
        </label>
        <button type="submit" disabled={!name.trim()}>Log visit</button>
      </form>

      <section>
        <h2>Recent</h2>
        {visits.length === 0 ? (
          <p className="empty">Your first restaurant lands here.</p>
        ) : (
          <ul>
            {visits.slice(0, 12).map((v) => (
              <li key={v.id}>
                {v.photoLocalId && photoUrls[v.photoLocalId] && (
                  <img src={photoUrls[v.photoLocalId]} alt={`Photo from ${v.name}`} />
                )}
                <div className="meta">
                  <strong>{v.name}</strong>
                  <small>
                    {new Date(v.visitedAt).toLocaleDateString()} · {v.rating}/5
                    {v.coords ? ` · ${v.coords.lat.toFixed(3)}, ${v.coords.lon.toFixed(3)}` : ''}
                  </small>
                  {v.notes && <p>{v.notes}</p>}
                </div>
                <button onClick={() => void remove(v)} aria-label={`Remove ${v.name}`}>×</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
