/**
 * SVG path helpers for the kid's drawing canvas.
 *
 * Why SVG instead of canvas pixels: SVG is tiny (a few KB per page),
 * scales from a 4-year-old's tablet thumb to a grandparent's iPad
 * mirror without going pixelated, and serialises to a string we can
 * hand to OPFS without binary-encoding gymnastics.
 *
 * Stroke shape: a single `<path>` per stroke with M / L commands. We
 * don't smooth — the kid's wobble is the point. Bezier-fit would
 * "improve" the squiggle, which is exactly what VOICE.md says not to
 * do.
 */

export interface StrokePoint {
  x: number;
  y: number;
}

export interface Stroke {
  /** Hex string — the canvas only allows 3 colours. */
  color: string;
  /** Line width in SVG user units. */
  width: number;
  points: StrokePoint[];
}

export interface DrawingDoc {
  width: number;
  height: number;
  strokes: Stroke[];
}

const NUM_PRECISION = 1;

function fmtNum(n: number): string {
  // Round to 1 decimal — shaves bytes without making the squiggle
  // look like a robot drew it.
  const v = Number(n.toFixed(NUM_PRECISION));
  return Number.isInteger(v) ? String(v) : v.toFixed(NUM_PRECISION);
}

export function strokeToPathD(stroke: Stroke): string {
  if (stroke.points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < stroke.points.length; i++) {
    const p = stroke.points[i]!;
    parts.push(`${i === 0 ? 'M' : 'L'}${fmtNum(p.x)} ${fmtNum(p.y)}`);
  }
  return parts.join('');
}

export function drawingToSvg(doc: DrawingDoc): string {
  const w = Math.max(1, Math.round(doc.width));
  const h = Math.max(1, Math.round(doc.height));
  const paths: string[] = [];
  for (const stroke of doc.strokes) {
    const d = strokeToPathD(stroke);
    if (!d) continue;
    paths.push(
      `<path d="${d}" stroke="${stroke.color}" stroke-width="${fmtNum(stroke.width)}" stroke-linecap="round" stroke-linejoin="round" fill="none" />`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${paths.join('')}</svg>`;
}

/**
 * Drop the last stroke. Single-level undo only — the voice doc is
 * explicit that the squiggle stays a squiggle, but a typo undo is OK.
 */
export function undoLastStroke(doc: DrawingDoc): DrawingDoc {
  if (doc.strokes.length === 0) return doc;
  return { ...doc, strokes: doc.strokes.slice(0, -1) };
}

export function emptyDrawing(width: number, height: number): DrawingDoc {
  return { width, height, strokes: [] };
}

export function appendPoint(doc: DrawingDoc, point: StrokePoint): DrawingDoc {
  if (doc.strokes.length === 0) return doc;
  const last = doc.strokes[doc.strokes.length - 1]!;
  const next: Stroke = { ...last, points: [...last.points, point] };
  return { ...doc, strokes: [...doc.strokes.slice(0, -1), next] };
}

export function startStroke(doc: DrawingDoc, color: string, width: number, point: StrokePoint): DrawingDoc {
  const stroke: Stroke = { color, width, points: [point] };
  return { ...doc, strokes: [...doc.strokes, stroke] };
}

/** The three colours the kid can pick. Sharp, warm, no rainbow. */
export const KID_COLOURS = [
  { id: 'ink', name: 'Black', hex: '#1A1814' },
  { id: 'marigold', name: 'Marigold', hex: '#E8C547' },
  { id: 'sage', name: 'Sage', hex: '#5E7B5C' },
] as const;

export type KidColourId = (typeof KID_COLOURS)[number]['id'];

export function brushHex(id: KidColourId): string {
  const found = KID_COLOURS.find((c) => c.id === id);
  return found?.hex ?? '#1A1814';
}

/** Brush sizes in SVG user units. Big enough for fingers. */
export const BRUSH_SIZES = [6, 12, 22] as const;
export type BrushSize = (typeof BRUSH_SIZES)[number];
