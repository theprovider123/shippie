/**
 * Capture page — the user points at the receipt and triggers OCR. The
 * model load happens here on the first run; subsequent receipts skip
 * the download phase.
 */
import { useState } from 'react';
import { CaptureSurface } from '../components/CaptureSurface.tsx';
import { OcrProgress } from '../components/OcrProgress.tsx';
import { rotateImageDataUrl } from '../lib/image-processing.ts';
import { runReceiptOcr, type OcrProgress as OcrProgressEvent } from '../lib/ocr-runtime.ts';

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
  const [rotating, setRotating] = useState(false);

  async function runExtraction() {
    if (!imageDataUrl) return;
    setRunning(true);
    setProgress({ phase: 'init' });
    try {
      const result = await runReceiptOcr(imageDataUrl, (p) => setProgress(p));
      onMarkWarm();
      if (result.orientationTurns !== 0) setImageDataUrl(result.imageDataUrl);
      onExtracted(result.text, result.imageDataUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'OCR failed';
      setProgress({ phase: 'error', message: msg });
      setRunning(false);
    }
  }

  async function rotate(turns: number) {
    if (!imageDataUrl || rotating || running) return;
    setRotating(true);
    setProgress(null);
    try {
      setImageDataUrl(await rotateImageDataUrl(imageDataUrl, turns));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "couldn't rotate that image";
      setProgress({ phase: 'error', message: msg });
    } finally {
      setRotating(false);
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
          <div className="rotate-actions" aria-label="Rotate receipt photo">
            <button type="button" className="ghost" disabled={running || rotating} onClick={() => void rotate(-1)}>
              Rotate left
            </button>
            <button type="button" className="ghost" disabled={running || rotating} onClick={() => void rotate(1)}>
              Rotate right
            </button>
          </div>
          <ul className="capture-checklist" aria-label="Receipt photo checklist">
            <li>Receipt edges visible</li>
            <li>Text upright</li>
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
