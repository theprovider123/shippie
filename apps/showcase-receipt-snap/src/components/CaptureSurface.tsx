/**
 * Multi-input capture: camera, photo library / Files, paste from
 * clipboard, and drag/drop on desktop. The surface owns the downscale
 * step — receipts get compressed before local storage, but kept sharp
 * enough for thermal-printer OCR.
 * Original full-res photos are never persisted.
 */
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { compressReceiptImage } from '../lib/image-processing.ts';

interface CaptureSurfaceProps {
  onCaptured: (dataUrl: string) => void;
}

type CaptureSource = 'camera' | 'library' | 'drop' | 'paste';

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
      const dataUrl = await compressReceiptImage(file);
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
