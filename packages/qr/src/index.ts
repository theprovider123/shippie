/**
 * @shippie/qr — brand-styled QR codes.
 *
 * Wraps `qr-code-styling` with rocket-center brand defaults. Async
 * because the underlying lib renders via canvas/DOM; consumers should
 * await or `{#await}`.
 *
 * Client-only. Do not invoke from server-side code (load functions,
 * worker handlers); SSR a placeholder and render on the client.
 */
import QRCodeStyling, { type Options } from 'qr-code-styling';

export type EccLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrOpts {
  /** Error-correction level. M is fine for invite URLs; H for transfer keys (more redundancy under the rocket punch-out). */
  ecc?: EccLevel;
  /** Pixel side. Default 256. */
  size?: number;
  /** 'rocket' overlays the Shippie rocket SVG; 'none' is a plain QR. */
  brand?: 'rocket' | 'none';
  /** Foreground / "dot" colour. */
  fg?: string;
  /** Background colour. Pass 'transparent' for layered placement. */
  bg?: string;
}

/**
 * Inline rocket lockup. Kept here so the consumer doesn't depend on
 * platform asset paths (the package is meant to work in the CLI and
 * the wrapper SDK too).
 */
const ROCKET_SVG_DATA_URL = (() => {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="48" fill="#1F2A24"/>
  <g fill="none" stroke="#E8603C" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M50 22 c -10 12 -14 28 -10 44"/>
    <path d="M50 22 c 10 12 14 28 10 44"/>
    <path d="M40 66 q 10 6 20 0"/>
    <circle cx="50" cy="48" r="5" fill="#D9A658" stroke="#D9A658"/>
  </g>
</svg>`;
  if (typeof btoa !== 'undefined') {
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  }
  // Node fallback for tests. Buffer is global there.
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
})();

function buildOptions(data: string, opts: QrOpts): Options {
  const ecc = opts.ecc ?? 'M';
  const size = opts.size ?? 256;
  const brand = opts.brand ?? 'rocket';
  const fg = opts.fg ?? '#14120F';
  const bg = opts.bg ?? '#FAF7EF';

  const base: Options = {
    width: size,
    height: size,
    type: 'svg',
    data,
    qrOptions: {
      errorCorrectionLevel: ecc,
    },
    dotsOptions: {
      type: 'square',
      color: fg,
    },
    backgroundOptions: {
      color: bg,
    },
    cornersSquareOptions: {
      type: 'square',
      color: fg,
    },
    cornersDotOptions: {
      type: 'square',
      color: fg,
    },
  };

  if (brand === 'rocket') {
    base.image = ROCKET_SVG_DATA_URL;
    base.imageOptions = {
      crossOrigin: 'anonymous',
      hideBackgroundDots: true,
      imageSize: 0.28,
      margin: 4,
    };
  }

  return base;
}

/**
 * Returns a stand-alone SVG string. Drop into a Svelte template:
 *   {#await qrSvg(url, { ecc: 'H' }) then svg}{@html svg}{/await}
 */
export async function qrSvg(data: string, opts: QrOpts = {}): Promise<string> {
  const code = new QRCodeStyling(buildOptions(data, opts));
  const blob = await code.getRawData('svg');
  if (!blob) throw new Error('qrSvg: empty render');
  if ('text' in blob && typeof blob.text === 'function') {
    return await blob.text();
  }
  // Buffer (Node) fallthrough
  if (Buffer.isBuffer?.(blob)) {
    return blob.toString('utf8');
  }
  throw new Error('qrSvg: unsupported runtime blob');
}

/** Returns a data: URL ready for `<img src>`. */
export async function qrPngDataUrl(
  data: string,
  opts: QrOpts = {},
): Promise<string> {
  const code = new QRCodeStyling({ ...buildOptions(data, opts), type: 'canvas' });
  const blob = await code.getRawData('png');
  if (!blob) throw new Error('qrPngDataUrl: empty render');
  if ('arrayBuffer' in blob && typeof blob.arrayBuffer === 'function') {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]!);
    return `data:image/png;base64,${btoa(bin)}`;
  }
  if (Buffer.isBuffer?.(blob)) {
    return `data:image/png;base64,${blob.toString('base64')}`;
  }
  throw new Error('qrPngDataUrl: unsupported runtime blob');
}

/**
 * Receiver leg of device transfer. Whitepaper roadmaps to v1.5;
 * `BarcodeDetector` is unsupported in Safari today and pulling
 * `@zxing/browser` doubles the bundle. Stub is here so the API shape
 * doesn't change later.
 */
export async function scanQr(_stream: MediaStream): Promise<string | null> {
  throw new Error('not_implemented');
}
