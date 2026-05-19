/**
 * Capture page — the user points at the receipt and triggers OCR. The
 * model load happens here on the first run; subsequent receipts skip
 * the download phase.
 */
import { useState } from 'react';
import { CaptureSurface } from '../components/CaptureSurface.tsx';
import { OcrProgress } from '../components/OcrProgress.tsx';
import { runOcr, type OcrProgress as OcrProgressEvent } from '../lib/ocr-runtime.ts';

interface CapturePageProps {
  /** The user has run OCR at least once on this device. */
  modelWarm: boolean;
  onExtracted: (rawText: string, dataUrl: string) => void;
  onMarkWarm: () => void;
}

export function CapturePage({ modelWarm, onExtracted, onMarkWarm }: CapturePageProps) {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<OcrProgressEvent | null>(null);
  const [running, setRunning] = useState(false);

  async function runExtraction() {
    if (!imageDataUrl) return;
    setRunning(true);
    setProgress({ phase: 'init' });
    try {
      const text = await runOcr(imageDataUrl, (p) => setProgress(p));
      onMarkWarm();
      onExtracted(text, imageDataUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OCR failed';
      setProgress({ phase: 'error', message: msg });
      setRunning(false);
    }
  }

  function reset() {
    setImageDataUrl(null);
    setProgress(null);
    setRunning(false);
  }

  return (
    <section className="page capture-page">
      {!imageDataUrl ? (
        <CaptureSurface onCaptured={setImageDataUrl} />
      ) : (
        <>
          <div className="page-heading">
            <p className="eyebrow">Captured</p>
            <h2>Check the photo</h2>
            <p className="muted small">
              Make sure the vendor, date, and total are readable before OCR starts.
            </p>
          </div>
          <div className="capture-preview">
            <img src={imageDataUrl} alt="captured receipt" />
          </div>
          <ul className="capture-checklist" aria-label="Receipt photo checklist">
            <li>Receipt edges visible</li>
            <li>Total and VAT lines readable</li>
            <li>No glare across the amount</li>
          </ul>
          {!running ? (
            <div className="capture-actions">
              <button type="button" className="ghost" onClick={reset}>
                Choose different photo
              </button>
              <button type="button" className="primary" onClick={runExtraction}>
                Read receipt
              </button>
            </div>
          ) : null}
          <OcrProgress state={progress} firstRun={!modelWarm} />
          {progress?.phase === 'error' ? (
            <div className="capture-actions">
              <button type="button" className="ghost" onClick={reset}>
                Start over
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
