/**
 * Signature path serialisation. The pad records strokes as arrays of
 * {x, y} points; we serialise them as one SVG path per stroke so the
 * signature can round-trip from the DB to a print view.
 *
 * Width is fixed at 320 × 120 so PDFs sit nicely above the inspector's
 * name without needing any layout math.
 */

export interface Point {
  x: number;
  y: number;
}

export type Stroke = ReadonlyArray<Point>;

export const SIGNATURE_WIDTH = 320;
export const SIGNATURE_HEIGHT = 120;

const ROUND = (n: number) => Math.round(n * 100) / 100;

export function strokeToPath(stroke: Stroke): string {
  if (stroke.length === 0) return '';
  if (stroke.length === 1) {
    const p = stroke[0]!;
    return `M${ROUND(p.x)},${ROUND(p.y)} l0,0`;
  }
  const head = stroke[0]!;
  const tail = stroke
    .slice(1)
    .map((p) => `L${ROUND(p.x)},${ROUND(p.y)}`)
    .join('');
  return `M${ROUND(head.x)},${ROUND(head.y)}${tail}`;
}

/** Serialise an entire signature (multiple strokes) to a single SVG string. */
export function strokesToSvg(strokes: ReadonlyArray<Stroke>): string {
  const paths = strokes
    .filter((s) => s.length > 0)
    .map((s) => `<path d="${strokeToPath(s)}" fill="none" stroke="#2C1F14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIGNATURE_WIDTH} ${SIGNATURE_HEIGHT}" width="${SIGNATURE_WIDTH}" height="${SIGNATURE_HEIGHT}">${paths}</svg>`;
}

const PATH_RE = /<path[^>]*\sd="([^"]+)"/g;
const POINT_RE = /[ML]\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/g;

/** Parse an SVG signature back into stroke arrays. Forgiving of formatting. */
export function svgToStrokes(svg: string): Stroke[] {
  const out: Stroke[] = [];
  PATH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PATH_RE.exec(svg)) !== null) {
    const d = match[1] ?? '';
    const stroke: Point[] = [];
    POINT_RE.lastIndex = 0;
    let p: RegExpExecArray | null;
    while ((p = POINT_RE.exec(d)) !== null) {
      const x = Number(p[1]);
      const y = Number(p[2]);
      if (Number.isFinite(x) && Number.isFinite(y)) stroke.push({ x, y });
    }
    if (stroke.length > 0) out.push(stroke);
  }
  return out;
}

export function isMeaningfulSignature(svg: string | null | undefined): boolean {
  if (!svg) return false;
  const strokes = svgToStrokes(svg);
  const points = strokes.reduce((sum, s) => sum + s.length, 0);
  return points >= 6; // anything less is a tap, not a signature
}
