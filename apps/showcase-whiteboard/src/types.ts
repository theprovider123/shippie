/**
 * Wire types shared between the React UI and the canvas worker.
 *
 * Strokes are an array of {x,y,t} points. Color + width are per-stroke.
 * `clientId` lets the renderer cull echoes of strokes we authored
 * locally (the predictive paint already covered them).
 */
export interface StrokePoint {
  x: number;
  y: number;
  t: number;
}

export interface Stroke {
  id: string;
  authorId: string;
  color: string;
  width: number;
  points: StrokePoint[];
}

export interface BoardCommand {
  kind: 'clear';
  by: string;
  at: number;
}
