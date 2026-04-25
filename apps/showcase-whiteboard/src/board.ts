/**
 * Whiteboard CRDT model.
 *
 * Strokes live in a `Y.Array<Stroke>` named `strokes` on the group's
 * sharedState. We append the in-progress stroke as a single Y.Map and
 * mutate the `points` Y.Array as the user moves their finger — that
 * way other peers see the stroke grow in real time, not just when the
 * pointer is released.
 *
 * Clear-board is a separate eventLog ('board-cmds') because Yjs
 * deletions are expensive — a single LWW event broadcasting the
 * "current epoch" is cheap, and clients drop strokes whose epoch is
 * older.
 */
import * as Y from 'yjs';
import type { Stroke, StrokePoint } from './types.ts';

export interface BoardState {
  strokesArray: Y.Array<Y.Map<unknown>>;
}

export function bindBoard(doc: Y.Doc): BoardState {
  return {
    strokesArray: doc.getArray<Y.Map<unknown>>('strokes'),
  };
}

export function strokeToYMap(stroke: Stroke): Y.Map<unknown> {
  const map = new Y.Map();
  map.set('id', stroke.id);
  map.set('authorId', stroke.authorId);
  map.set('color', stroke.color);
  map.set('width', stroke.width);
  const points = new Y.Array<StrokePoint>();
  points.push(stroke.points);
  map.set('points', points);
  return map;
}

export function yMapToStroke(m: Y.Map<unknown>): Stroke {
  const points = (m.get('points') as Y.Array<StrokePoint>).toArray();
  return {
    id: m.get('id') as string,
    authorId: m.get('authorId') as string,
    color: m.get('color') as string,
    width: m.get('width') as number,
    points,
  };
}

/** Append a single point to a stroke that's already in the doc. */
export function appendPoint(strokeMap: Y.Map<unknown>, point: StrokePoint): void {
  const arr = strokeMap.get('points') as Y.Array<StrokePoint>;
  arr.push([point]);
}
