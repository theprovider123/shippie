/**
 * Full-size photo viewer modal. Tap-to-close.
 */
import { useEffect, useState } from 'react';
import { loadPhoto } from '../photo-store.ts';

interface PhotoViewerProps {
  photoLocalId: string;
  date: string;
  weightKg: number;
  onClose: () => void;
}

export function PhotoViewer({ photoLocalId, date, weightKg, onClose }: PhotoViewerProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    void (async () => {
      const blob = await loadPhoto(photoLocalId).catch(() => null);
      if (!blob || cancelled) return;
      created = URL.createObjectURL(blob);
      setUrl(created);
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [photoLocalId]);

  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" onClick={onClose}>
      <button className="photo-viewer__close" aria-label="Close photo">×</button>
      {url ? (
        <img src={url} alt={`Body photo ${date}`} onClick={(e) => e.stopPropagation()} />
      ) : (
        <p className="muted">Loading…</p>
      )}
      <footer className="photo-viewer__caption">
        <strong>{date}</strong>
        <span>{weightKg.toFixed(1)} kg</span>
      </footer>
    </div>
  );
}
