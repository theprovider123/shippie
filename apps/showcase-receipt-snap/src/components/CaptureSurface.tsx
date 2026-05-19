/**
 * Multi-input capture: camera, photo library / Files, paste from
 * clipboard, and drag/drop on desktop. The surface owns the downscale
 * step — receipts get compressed to <1280px on the long edge and
 * re-encoded as JPEG @ ~0.85 quality so localStorage doesn't blow up.
 * Original full-res photos are never persisted.
 */
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';

interface CaptureSurfaceProps {
  onCaptured: (dataUrl: string) => void;
}

const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.85;

type CaptureSource = 'camera' | 'library' | 'drop' | 'paste';

interface DrawableImage {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  close: () => void;
}

async function loadDrawable(file: Blob): Promise<DrawableImage> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, width, height) => ctx.drawImage(bitmap, 0, 0, width, height),
        close: () => bitmap.close?.(),
      };
    } catch {
      // Fall through to <img>. Some mobile browsers are stricter about
      // camera-library blobs, while the image element can still decode them.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        draw: (ctx, width, height) => ctx.drawImage(image, 0, 0, width, height),
        close: () => URL.revokeObjectURL(url),
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("couldn't read that image"));
    };
    image.src = url;
  });
}

async function downscale(file: Blob): Promise<string> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('Choose a receipt photo or image file.');
  }
  const image = await loadDrawable(file);
  const ratio = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
  const w = Math.round(image.width * ratio);
  const h = Math.round(image.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  image.draw(ctx, w, h);
  image.close();
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  if (!dataUrl || dataUrl === 'data:,') throw new Error("couldn't read that image");
  return dataUrl;
}

export function CaptureSurface({ onCaptured }: CaptureSurfaceProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputId = useId();
  const libraryInputId = useId();
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busySource, setBusySource] = useState<CaptureSource | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: Blob | undefined | null, source: CaptureSource) {
    if (!file) return;
    setBusy(true);
    setBusySource(source);
    setError(null);
    try {
      const dataUrl = await downscale(file);
      onCaptured(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "couldn't read that image");
    } finally {
      setBusy(false);
      setBusySource(null);
    }
  }

  function handleInputChange(
    e: ChangeEvent<HTMLInputElement>,
    source: Extract<CaptureSource, 'camera' | 'library'>,
  ) {
    const file = e.target.files?.[0];
    // Clear the input's value so re-selecting the SAME file fires
    // `change` again. Without this, retrying after a Re-take with
    // the same source file silently does nothing.
    e.target.value = '';
    void handleFile(file, source);
  }

  useEffect(() => {
    function onPaste(ev: ClipboardEvent) {
      const items = ev.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            void handleFile(blob, 'paste');
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
        if (file) void handleFile(file, 'drop');
      }}
    >
      <p className="eyebrow">Capture</p>
      <h2 className="capture-title">Snap or upload a receipt</h2>
      <p className="muted small">
        Take a fresh photo, or choose a receipt already saved in Photos or Files.
      </p>

      <div className="receipt-visual" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <input
        id={cameraInputId}
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="file-input"
        disabled={busy}
        onChange={(e) => handleInputChange(e, 'camera')}
      />
      <input
        id={libraryInputId}
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        className="file-input"
        disabled={busy}
        onChange={(e) => handleInputChange(e, 'library')}
      />

      <div className="capture-actions">
        <button
          type="button"
          className="primary capture-option capture-option-primary"
          disabled={busy}
          onClick={() => cameraInputRef.current?.click()}
        >
          <span>{busy && busySource === 'camera' ? 'Opening…' : 'Take photo'}</span>
          <small>Use the camera</small>
        </button>
        <button
          type="button"
          className="ghost capture-option"
          disabled={busy}
          onClick={() => libraryInputRef.current?.click()}
        >
          <span>{busy && busySource === 'library' ? 'Reading…' : 'Choose photo'}</span>
          <small>Photos or Files</small>
        </button>
        <p className="muted small mobile-capture-hint">
          Choose photo works for screenshots, saved receipt photos, and images in Files.
        </p>
        <p className="muted small desktop-capture-hint">
          On desktop, drop an image here or paste from clipboard.
        </p>
      </div>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
