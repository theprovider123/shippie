/**
 * P3 — Camera-driven barcode scan via the BarcodeDetector API.
 *
 * Browser support reality:
 *   - Chrome / Edge on Android, ChromeOS:                supported
 *   - Chrome on Linux desktop:                           often supported
 *   - Chrome on macOS / Windows desktop:                 partial / behind a flag
 *   - Safari (iOS / macOS), Firefox:                     unsupported
 *
 * `detectCameraScanAvailability()` is the load-bearing gate so the UI
 * can surface a graceful "type the digits" fallback on unsupported
 * runtimes instead of throwing.
 *
 * `scanFromCamera(video)` opens `navigator.mediaDevices.getUserMedia`
 * with the back camera, attaches it to a hidden <video>, and runs a
 * detection loop. Returns the first valid barcode or rejects on
 * permission denial / detection timeout.
 */

interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): {
    detect: (source: HTMLVideoElement | ImageBitmapSource) => Promise<
      Array<{ rawValue?: string; format?: string; boundingBox?: DOMRectReadOnly }>
    >;
  };
}

interface BarcodeDetectorWindow extends Window {
  BarcodeDetector?: BarcodeDetectorCtor;
}

export interface CameraScanAvailability {
  /** BarcodeDetector exists on globalThis. */
  detector: boolean;
  /** navigator.mediaDevices.getUserMedia is callable. */
  camera: boolean;
  /** Diagnostic message — shown to the user on unsupported browsers. */
  unsupportedReason?: string;
}

export function detectCameraScanAvailability(): CameraScanAvailability {
  const w = typeof window === 'undefined' ? null : (window as BarcodeDetectorWindow);
  const detector = Boolean(w?.BarcodeDetector);
  const camera = Boolean(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia);
  if (!detector) {
    return {
      detector: false,
      camera,
      unsupportedReason:
        'Camera scanning needs Chrome on Android. On iPhone, type the barcode digits — every other feature still works.',
    };
  }
  if (!camera) {
    return {
      detector: true,
      camera: false,
      unsupportedReason: 'Camera unavailable in this runtime.',
    };
  }
  return { detector: true, camera: true };
}

export interface CameraScanOptions {
  /** Auto-cancel the scan after this many ms. Default 20_000. */
  timeoutMs?: number;
  /** Detection loop interval. Default 250 ms. */
  pollIntervalMs?: number;
  /** Restrict to barcode formats — defaults to common product codes. */
  formats?: string[];
}

export interface CameraScanResult {
  rawValue: string;
  format?: string;
}

const DEFAULT_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

/**
 * Scan from the device's back camera. The caller passes a <video>
 * element (kept on-DOM so iOS will let it play); we attach the
 * MediaStream to it and start the detection loop.
 *
 * Resolves with the first detected barcode. Rejects on permission
 * denial, missing API, or `timeoutMs` expiring.
 */
export async function scanFromCamera(
  video: HTMLVideoElement,
  options: CameraScanOptions = {},
): Promise<CameraScanResult> {
  const w = window as BarcodeDetectorWindow;
  if (!w.BarcodeDetector) {
    throw new Error(
      'Camera scanning needs Chrome on Android. Type the barcode digits instead.',
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera unavailable in this runtime.');
  }
  const detector = new w.BarcodeDetector({
    formats: options.formats ?? DEFAULT_FORMATS,
  });
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  });
  video.srcObject = stream;
  // playsInline is set on the JSX element — calling play() here ensures
  // detection actually has frames to inspect.
  await video.play().catch(() => {});

  const timeoutMs = options.timeoutMs ?? 20_000;
  const pollIntervalMs = options.pollIntervalMs ?? 250;

  return new Promise<CameraScanResult>((resolve, reject) => {
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      clearInterval(loop);
      clearTimeout(timer);
      for (const track of stream.getTracks()) track.stop();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('No barcode detected within timeout.'));
    }, timeoutMs);
    const loop = setInterval(async () => {
      if (done) return;
      try {
        const codes = await detector.detect(video);
        const first = codes.find((c) => typeof c.rawValue === 'string' && c.rawValue.length > 0);
        if (first?.rawValue) {
          cleanup();
          resolve({ rawValue: first.rawValue, format: first.format });
        }
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }, pollIntervalMs);
  });
}
