/**
 * Settings page — privacy banner front-and-centre, plus export.
 *
 * Two exports:
 *   1. CSV — the text data (date, weight, body fat, method, note).
 *   2. Photos — bulk download as individual blob URLs, kicked off
 *      sequentially so the browser doesn't choke on 100 simultaneous
 *      anchor clicks.
 */
import { useState } from 'react';
import type { Entry } from '../lib/store.ts';
import { csvFilename, entriesToCsv, photoFilename } from '../lib/export.ts';
import { loadPhoto } from '../photo-store.ts';

interface SettingsProps {
  entries: readonly Entry[];
  onWipe: () => void;
}

export function Settings({ entries, onWipe }: SettingsProps) {
  const [exportingPhotos, setExportingPhotos] = useState(false);
  const [photoExportIndex, setPhotoExportIndex] = useState(0);
  const photoCount = entries.filter((e) => e.photoLocalId).length;

  function exportCsv() {
    const csv = entriesToCsv(entries);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = csvFilename();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function exportPhotos() {
    if (exportingPhotos) return;
    setExportingPhotos(true);
    setPhotoExportIndex(0);
    const photoEntries = entries.filter(
      (e): e is Entry & { photoLocalId: string } => Boolean(e.photoLocalId),
    );
    for (let i = 0; i < photoEntries.length; i += 1) {
      const e = photoEntries[i]!;
      const blob = await loadPhoto(e.photoLocalId).catch(() => null);
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = photoFilename(e.date, blob.type);
      a.click();
      // Tiny stagger so the browser actually queues each save dialog;
      // some mobile browsers drop rapid-fire downloads.
      await new Promise((r) => setTimeout(r, 250));
      URL.revokeObjectURL(url);
      setPhotoExportIndex(i + 1);
    }
    setExportingPhotos(false);
  }

  function wipeAll() {
    const sure = window.confirm(
      'Erase every entry and every photo on this device? This cannot be undone.',
    );
    if (!sure) return;
    onWipe();
  }

  return (
    <>
      <section className="privacy-callout">
        <h2>Privacy</h2>
        <p>
          Photos in this app are stored in IndexedDB on this phone, in a
          database called <code>shippie.body-metrics.photos</code>.
          Nothing is uploaded.
        </p>
        <p>
          The text data — date, weight, body fat, method, note — lives
          in localStorage under <code>shippie.body-metrics.v1</code>.
          Same story: this device only.
        </p>
        <p>
          If you delete the app, the photos go too. Export to your
          camera roll first if you want a backup.
        </p>
      </section>

      <section className="export">
        <h2>Export</h2>
        <p className="prose prose--small">
          CSV gives you all your weight and body-fat readings — opens
          in any spreadsheet. Photos download individually to your
          camera roll / Downloads folder.
        </p>
        <div className="export__actions">
          <button type="button" onClick={exportCsv} disabled={entries.length === 0}>
            Export CSV ({entries.length})
          </button>
          <button
            type="button"
            onClick={exportPhotos}
            disabled={photoCount === 0 || exportingPhotos}
          >
            {exportingPhotos
              ? `Exporting ${photoExportIndex} / ${photoCount}…`
              : `Export photos (${photoCount})`}
          </button>
        </div>
      </section>

      <section className="danger">
        <h2>Erase everything</h2>
        <p className="prose prose--small">
          Wipes every entry and every photo from this device. There is
          no copy elsewhere — that's the whole point.
        </p>
        <button type="button" className="danger-btn" onClick={wipeAll}>
          Erase all data
        </button>
      </section>
    </>
  );
}
