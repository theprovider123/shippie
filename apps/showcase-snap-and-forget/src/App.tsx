import { useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { classifyImage } from './labels';
import { blobToThumb, deleteSnap, listSnaps, newId, saveSnap, updateLabels, type Snap } from './storage';

/**
 * Snap and Forget — photograph anything to remember later.
 *
 * Save-first / enrich-later (per plan): capture writes the blob + thumb
 * to IndexedDB immediately. Classification runs asynchronously; the
 * snap row is patched and a `place.snapped` observation emits with the
 * AI labels.
 *
 * Geo: defaults to coarse-only (city/region/country); exact coords are
 * gated behind an explicit per-app permission grant via the platform's
 * intents bridge. v1 ships with no geo wiring at all — the field is
 * reserved in storage so a follow-up commit can light it up.
 */

const sdk = createShippieIframeSdk({ appId: 'app_snap_and_forget' });
const observations = createObservationClient(sdk);

const HERO_SUBTITLE_SEEN_KEY = 'snapAndForget:onboarding:heroSubtitle:v1';

export function App() {
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [busy, setBusy] = useState(false);
  const [labellingId, setLabellingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [showHeroSubtitle, setShowHeroSubtitle] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HERO_SUBTITLE_SEEN_KEY) !== '1';
    } catch {
      return true;
    }
  });

  useEffect(() => { void refresh(); }, []);

  async function refresh() {
    try {
      setSnaps(await listSnaps());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setBusy(true);
    setError(null);
    if (showHeroSubtitle) {
      setShowHeroSubtitle(false);
      try { localStorage.setItem(HERO_SUBTITLE_SEEN_KEY, '1'); } catch { /* ignore */ }
    }
    try {
      haptic('success');
      const id = newId();
      const thumb = await blobToThumb(file);
      const snap: Snap = {
        id,
        blob: file,
        thumbDataUrl: thumb,
        labels: [],
        capturedAt: new Date().toISOString(),
      };
      await saveSnap(snap);
      setSnaps((prev) => [snap, ...prev]);
      void labelInBackground(id, file);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function labelInBackground(id: string, blob: Blob) {
    setLabellingId(id);
    try {
      const hits = await classifyImage(blob);
      const labels = hits.slice(0, 4).map((h) => h.label);
      await updateLabels(id, labels);
      setSnaps((prev) => prev.map((s) => s.id === id ? { ...s, labels } : s));
      observations.emit({
        kind: 'place.snapped',
        labels,
        // Coarse geo deliberately omitted in v1 — see file docstring.
        at: new Date().toISOString(),
      });
    } catch (err) {
      setError(`Labels pending — ${(err as Error).message}`);
    } finally {
      setLabellingId(null);
    }
  }

  async function onDelete(id: string) {
    await deleteSnap(id);
    setSnaps((prev) => prev.filter((s) => s.id !== id));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return snaps;
    return snaps.filter((s) => s.labels.some((l) => l.toLowerCase().includes(q)));
  }, [snaps, search]);

  return (
    <main className="app">
      <header>
        <p className="eyebrow"><span className="dot" aria-hidden />Safelight · {snaps.length} on this device</p>
        <h1>Snap and <em>Forget</em></h1>
        {showHeroSubtitle ? (
          <p className="muted">Photograph anything. Search by what was in it.</p>
        ) : null}
      </header>

      {snaps.length > 0 ? (
        <div className="snap-stats">
          <span className="stat-label">Captured</span>
          <span className="snap-numeric">{snaps.length}<span className="unit">snaps</span></span>
        </div>
      ) : null}

      <section className="capture-row">
        <button
          type="button"
          className="primary big"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          {busy ? 'Saving…' : 'Snap'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFile}
          hidden
        />
      </section>

      <section className="search-row">
        <input
          type="search"
          placeholder={snaps.length === 0 ? 'snap something first…' : 'search by label (pizza, dog, beach…)'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={snaps.length === 0}
          aria-label="Search snaps by label"
        />
      </section>

      <section className="grid-section">
        {snaps.length === 0 ? (
          <p className="muted small">No snaps yet. Take one — the AI will label what's in it.</p>
        ) : (
          <div className="grid">
            {filtered.map((s) => (
              <figure key={s.id} className="cell">
                <img src={s.thumbDataUrl} alt={s.labels.join(', ') || s.capturedAt} loading="lazy" />
                <figcaption>
                  {s.labels.length > 0 ? (
                    <span className="labels">{s.labels.slice(0, 3).join(' · ')}</span>
                  ) : labellingId === s.id ? (
                    <span className="muted small">labelling…</span>
                  ) : (
                    <span className="muted small">
                      labels pending
                      {' · '}
                      <button
                        type="button"
                        className="link"
                        onClick={() => void labelInBackground(s.id, s.blob)}
                      >
                        retry
                      </button>
                    </span>
                  )}
                  <span className="muted small">{new Date(s.capturedAt).toLocaleString()}</span>
                  <button type="button" className="link" onClick={() => onDelete(s.id)}>delete</button>
                </figcaption>
              </figure>
            ))}
            {filtered.length === 0 ? <p className="muted small">No snaps match.</p> : null}
          </div>
        )}
      </section>

      {error ? <p className="error muted small">{error}</p> : null}
    </main>
  );
}
