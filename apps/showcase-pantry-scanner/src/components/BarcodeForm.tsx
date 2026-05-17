/**
 * Barcode scan + manual entry. Wraps `camera-scan` for the Chrome path
 * and falls back to a digit input for everything else.
 */
import { useMemo, useRef, useState } from 'react';
import { listKnownBarcodes } from '../barcode.ts';
import {
  detectCameraScanAvailability,
  scanFromCamera,
} from '../camera-scan.ts';

interface BarcodeFormProps {
  onResolve: (code: string) => void;
  onError?: (message: string) => void;
}

export function BarcodeForm({ onResolve, onError }: BarcodeFormProps) {
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraAvail = useMemo(() => detectCameraScanAvailability(), []);

  async function startCameraScan() {
    if (!cameraAvail.detector || !cameraAvail.camera) return;
    setScanning(true);
    try {
      const video = videoRef.current;
      if (!video) throw new Error('Video element missing');
      const result = await scanFromCamera(video);
      onResolve(result.rawValue);
      setCode('');
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Scan failed.');
    } finally {
      setScanning(false);
    }
  }

  return (
    <section className="scan">
      <h2>Scan</h2>
      {cameraAvail.detector && cameraAvail.camera ? (
        <div className="camera">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`camera-feed ${scanning ? 'active' : ''}`}
          />
          <button
            type="button"
            onClick={startCameraScan}
            disabled={scanning}
            className="row-btn row-btn-primary"
          >
            {scanning ? 'Scanning…' : 'Scan with camera'}
          </button>
        </div>
      ) : (
        <p className="hint">{cameraAvail.unsupportedReason}</p>
      )}
      <p className="hint">Or type a 12/13-digit barcode below.</p>
      <div className="row">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Barcode (digits only)"
          inputMode="numeric"
          aria-label="Barcode"
        />
        <button
          type="button"
          className="row-btn row-btn-primary"
          onClick={() => {
            if (code.trim()) {
              onResolve(code.trim());
              setCode('');
            }
          }}
        >
          Resolve
        </button>
      </div>
      <details>
        <summary>Demo barcodes (offline catalogue)</summary>
        <ul className="known">
          {listKnownBarcodes().map((b) => (
            <li key={b}>
              <button
                type="button"
                className="row-btn row-btn-ghost"
                onClick={() => {
                  onResolve(b);
                }}
              >
                {b}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
