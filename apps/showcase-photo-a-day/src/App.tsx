import { useEffect, useMemo, useRef, useState } from 'react';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { haptic } from '@shippie/sdk/wrapper';
import { classifyImage } from './labels';
import { blobToThumb, listDays, saveDay, todayKey, updateLabels, type DayRecord } from './storage';

/**
 * Photo a Day — one photo per day, AI labels what you saw.
 *
 * Save-first / enrich-later (per plan): capture writes the blob +
 * thumb to IndexedDB immediately and emits a placeholder observation.
 * Classification runs asynchronously; when labels arrive the row is
 * patched and a second observation is emitted with the real labels.
 *
 * Privacy: photo bytes never leave the device. Only the AI labels
 * (e.g. ["pizza"]) flow into the cross-tool observation bus.
 */

const sdk = createShippieIframeSdk({ appId: 'app_photo_a_day' });
const observations = createObservationClient(sdk);

export function App() {
  const [days, setDays] = useState<DayRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [labellingDate, setLabellingDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const today = todayKey();
  const todayRow = useMemo(() => days.find((d) => d.date === today), [days, today]);

  useEffect(() => { void refresh(); }, []);

  async function refresh() {
    try {
      setDays(await listDays());
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
    try {
      haptic('success');
      const thumb = await blobToThumb(file, 256);
      const record: DayRecord = {
        date: today,
        blob: file,
        thumbDataUrl: thumb,
        labels: [],
        capturedAt: new Date().toISOString(),
      };
      await saveDay(record);
      setDays((prev) => [record, ...prev.filter((d) => d.date !== today)]);

      // Async label pass — never block capture on it.
      void labelInBackground(today, file);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function labelInBackground(date: string, blob: Blob) {
    setLabellingDate(date);
    try {
      const hits = await classifyImage(blob);
      const labels = hits.slice(0, 3).map((h) => h.label);
      await updateLabels(date, labels);
      setDays((prev) => prev.map((d) => d.date === date ? { ...d, labels } : d));
      observations.emit({
        kind: 'photo.labelled',
        labels,
        at: new Date().toISOString(),
      });
    } catch (err) {
      // Silent fall back — capture still saved, just with no labels.
      // Surface as a small footer note rather than a blocking error.
      setError(`Labels pending — ${(err as Error).message}`);
    } finally {
      setLabellingDate(null);
    }
  }

  return (
    <main className="app">
      <header>
        <h1>Photo a Day</h1>
        <p className="muted">{todayRow ? `Today: ${todayRow.labels.length ? todayRow.labels.join(' · ') : 'labels pending…'}` : 'One photo for today'}</p>
      </header>

      {!todayRow ? (
        <section className="capture-card">
          <button
            type="button"
            className="primary big"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Take today’s photo'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFile}
            hidden
          />
          <p className="muted small">Photo stays on this device. Labels are added by the on-device AI.</p>
        </section>
      ) : null}

      {todayRow ? (
        <section className="hero">
          <img src={todayRow.thumbDataUrl} alt={`Today, ${today}`} className="hero-img" />
          {labellingDate === today ? <p className="muted small">Labelling…</p> : null}
        </section>
      ) : null}

      <section className="grid-section">
        <h2>Calendar</h2>
        {days.length === 0 ? (
          <p className="muted small">Your photos will appear here.</p>
        ) : (
          <div className="grid">
            {days.map((d) => (
              <figure key={d.date} className="cell">
                <img src={d.thumbDataUrl} alt={d.date} loading="lazy" />
                <figcaption>
                  <span className="muted small">{d.date}</span>
                  {d.labels.length > 0 ? <span className="labels">{d.labels.join(' · ')}</span> : null}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      {error ? <p className="error muted small">{error}</p> : null}
    </main>
  );
}
