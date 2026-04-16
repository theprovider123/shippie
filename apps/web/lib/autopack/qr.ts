/**
 * QR code generator for install URLs.
 *
 * Produces a PNG Buffer at 512x512 using the high error-correction level
 * so it's still scannable if printed and scuffed. The install URL is
 * `https://{slug}.shippie.app/` in prod and `http://{slug}.localhost:4200/` in dev.
 *
 * Spec v6 §8 (auto-packaging — install QR).
 */
import QRCode from 'qrcode';

export interface BuildInstallQrInput {
  slug: string;
  baseUrl?: string; // defaults to https://{slug}.shippie.app
}

export async function buildInstallQr(input: BuildInstallQrInput): Promise<Buffer> {
  const url = input.baseUrl ?? `https://${input.slug}.shippie.app/`;
  return QRCode.toBuffer(url, {
    type: 'png',
    errorCorrectionLevel: 'H',
    margin: 2,
    scale: 16, // 16 * 21 (v1 grid) ≈ 336px; but we set fixed width below
    width: 512,
    color: {
      dark: '#14120F',
      light: '#F5EFE4',
    },
  });
}
