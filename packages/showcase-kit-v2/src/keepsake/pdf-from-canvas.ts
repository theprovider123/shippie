import jsPDF from 'jspdf';

export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      'image/png',
    );
  });
}

export function bytesToBase64(bytes: Uint8Array): string {
  // chunked to avoid call-stack overflow on large blobs
  const CHUNK = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  if (typeof btoa !== 'undefined') return btoa(bin);
  // Node/Bun fallback
  type BufferLike = { from: (s: string, e: string) => { toString: (e: string) => string } };
  const BufferCtor = (globalThis as unknown as { Buffer?: BufferLike }).Buffer;
  if (BufferCtor) return BufferCtor.from(bin, 'binary').toString('base64');
  throw new Error('bytesToBase64: no btoa or Buffer available');
}

export async function pngToPdf(pngBlob: Blob, widthPx: number, heightPx: number): Promise<Blob> {
  const bytes = new Uint8Array(await pngBlob.arrayBuffer());
  const dataUrl = `data:image/png;base64,${bytesToBase64(bytes)}`;

  const aspect = widthPx / heightPx;
  const pageW = 595;
  const pageH = pageW / aspect;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: [pageW, pageH] });
  pdf.addImage(dataUrl, 'PNG', 0, 0, pageW, pageH);
  return pdf.output('blob');
}
