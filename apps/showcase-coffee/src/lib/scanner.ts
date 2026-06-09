// Barcode → bag lookup.
//
// Uses the browser-native BarcodeDetector where available (Chrome/Android,
// recent Safari) so we add no heavy dependency and stay fully offline. If the
// API is missing the caller falls back to manual entry. A scanned barcode is
// matched against the World roaster index to pre-fill what we can; lot. never
// blocks on a remote barcode database.

import { ROASTERS, type WorldRoaster } from '../data/world.ts';

export interface ScanResult {
  barcode: string;
  /** Best-guess roaster, if the code prefix is recognised. */
  roaster?: WorldRoaster;
}

interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

export function barcodeSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/** Run continuous detection against a <video> element until a code is found
 *  or `signal` aborts. Resolves null if unsupported or aborted. */
export async function scanFromVideo(
  video: HTMLVideoElement,
  signal: AbortSignal,
): Promise<ScanResult | null> {
  if (!barcodeSupported()) return null;
  const Ctor = (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector;
  const detector = new Ctor({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'] });

  return new Promise<ScanResult | null>((resolve) => {
    const tick = async () => {
      if (signal.aborted) return resolve(null);
      try {
        const codes = await detector.detect(video);
        const first = codes[0];
        if (first?.rawValue) return resolve(lookup(first.rawValue));
      } catch {
        /* transient decode error — keep trying */
      }
      requestAnimationFrame(() => void tick());
    };
    signal.addEventListener('abort', () => resolve(null), { once: true });
    void tick();
  });
}

/** Map a raw barcode to whatever we can infer locally. */
export function lookup(barcode: string): ScanResult {
  // No public open barcode→coffee registry exists offline; we surface the
  // code and let the user confirm the rest. A future sync pull could enrich.
  return { barcode, roaster: guessRoaster(barcode) };
}

function guessRoaster(barcode: string): WorldRoaster | undefined {
  // Toy heuristic: map the trailing digit to a roaster so the demo flow is
  // deterministic. Real GS1 prefixes would slot in here.
  const n = Number(barcode.replace(/\D/g, '').slice(-1));
  if (Number.isNaN(n)) return undefined;
  return ROASTERS[n % ROASTERS.length];
}
