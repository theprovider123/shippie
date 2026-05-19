/**
 * Triple-input capture: camera (mobile), file picker (desktop), and
 * paste from clipboard. Drag/drop on desktop. The surface owns the
 * downscale step — receipts get compressed to <1024px on the long
 * edge and re-encoded as JPEG @ ~0.85 quality so localStorage doesn't
 * blow up. Original full-res photos are never persisted.
 */
import { useEffect, useRef, useState } from 'react';

interface CaptureSurfaceProps {
  onCaptured: (dataUrl: string) => void;
}

const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.85;

async function downscale(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

export function CaptureSurface({ onCaptured }: CaptureSurfaceProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: Blob | undefined | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await downscale(file);
      onCaptured(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "couldn't read that image");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onPaste(ev: ClipboardEvent) {
      const items = ev.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            handleFile(blob);
            return;
          }
        }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`capture-surface ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
    >
      <p className="eyebrow">Capture</p>
      <h2 className="capture-title">Snap a receipt</h2>
      <p className="muted small">
        Photos and OCR run on this phone. No image leaves the device.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Clear the input's value so re-selecting the SAME file fires
          // `change` again. Without this, retrying after a Re-take with
          // the same source file silently does nothing.
          e.target.value = '';
          handleFile(file);
        }}
      />

      <div className="capture-actions">
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {busy ? 'Reading…' : 'Take photo'}
        </button>
        <p className="muted small">or drop an image here · paste from clipboard</p>
      </div>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
