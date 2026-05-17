/**
 * Tiny sketch helper. Shared between the live canvas + the reveal
 * thumbnails. The canvas API is touch-friendly; final stroke list is
 * encoded as a JPEG data URL (256×256, q=0.5) so each chain entry
 * stays under ~30KB inside the eventLog.
 */

export interface SketchPoint { x: number; y: number }
export interface SketchStroke { color: string; width: number; points: SketchPoint[] }

export function strokesToDataUrl(strokes: SketchStroke[], size = 256): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.beginPath();
    const [first, ...rest] = stroke.points;
    if (!first) continue;
    ctx.moveTo(first.x * size, first.y * size);
    for (const p of rest) ctx.lineTo(p.x * size, p.y * size);
    ctx.stroke();
  }
  return canvas.toDataURL('image/jpeg', 0.5);
}
