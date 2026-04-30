/**
 * Position library — names, descriptions, simple line-art glyphs,
 * heat level, and per-device flags (tried / want).
 *
 * Y.Map shape:
 *   tried: Record<deviceId, Record<positionId, true>>
 *   want:  Record<deviceId, Record<positionId, true>>
 */
import * as Y from 'yjs';

export type PositionLevel = 1 | 2 | 3;

export interface Position {
  id: string;
  name: string;
  description: string;
  level: PositionLevel;
  // Inline SVG path string for a tasteful line-art glyph (not anatomical).
  // Two-figure abstract — circles + curves.
  glyph: string;
}

// Light, abstract two-figure line art. Circles = heads, curves = bodies.
// Each viewBox is "0 0 120 80". Stroke 2, no fill.
const G = {
  // Two figures sitting / facing
  facingClose: 'M30 60 a8 8 0 1 1 0.1 0 M30 56 q-8 -10 0 -22 M90 60 a8 8 0 1 1 0.1 0 M90 56 q8 -10 0 -22 M40 50 q20 -8 40 0',
  // One above one below
  oneAbove: 'M60 18 a8 8 0 1 1 0.1 0 M60 14 q-15 0 0 22 M60 50 q-15 0 0 22 M60 56 a8 8 0 1 1 0.1 0',
  // Side by side curves (spoon)
  sideCurve: 'M22 34 a18 18 0 0 1 36 0 M40 38 a18 18 0 0 1 36 0 M58 42 a18 18 0 0 1 36 0',
  // Crossed legs
  crossed: 'M30 35 a8 8 0 1 1 0.1 0 M90 35 a8 8 0 1 1 0.1 0 M35 50 l30 14 M85 50 l-30 14',
  // Standing close
  standClose: 'M40 18 a8 8 0 1 1 0.1 0 M80 18 a8 8 0 1 1 0.1 0 M40 26 v44 M80 26 v44 M44 40 q16 -6 32 0',
  // Two arcs leaning
  leaning: 'M28 60 q12 -45 32 0 M62 60 q12 -45 32 0',
  // Circle within circle (close embrace)
  embrace: 'M60 40 a18 18 0 1 1 0.1 0 M60 40 a8 8 0 1 1 0.1 0',
  // Reclining figures
  reclining: 'M20 50 q40 -25 80 0 M20 60 q40 -10 80 0 M28 48 a4 4 0 1 1 0.1 0 M92 48 a4 4 0 1 1 0.1 0',
  // Asymmetric pair
  asymPair: 'M30 50 a10 10 0 1 1 0.1 0 M40 56 q24 12 50 -10 M90 30 a6 6 0 1 1 0.1 0',
  // Curves crossing
  crossingCurves: 'M20 60 q40 -50 80 -10 M100 60 q-40 -50 -80 -10',
};

export const POSITIONS: ReadonlyArray<Position> = [
  { id: 'p1', level: 1, name: 'Spoon', description: 'You behind, both on your side. Slow.', glyph: G.sideCurve },
  { id: 'p2', level: 1, name: 'Missionary, slow', description: 'Weight on forearms, eye contact, no rush.', glyph: G.oneAbove },
  { id: 'p3', level: 1, name: 'Lap', description: 'One sits on the other\'s lap, facing them.', glyph: G.facingClose },
  { id: 'p4', level: 1, name: 'Side facing', description: 'Both on your sides, faces close, legs interlocked.', glyph: G.facingClose },
  { id: 'p5', level: 1, name: 'Reclining together', description: 'Half-sitting, half-lying, one between the other\'s legs.', glyph: G.reclining },
  { id: 'p6', level: 2, name: 'Cowgirl', description: 'They sit, you ride facing them. Set the pace.', glyph: G.oneAbove },
  { id: 'p7', level: 2, name: 'Reverse cowgirl', description: 'Riding facing away. View as much as feeling.', glyph: G.oneAbove },
  { id: 'p8', level: 2, name: 'Doggy', description: 'On all fours, them behind. Easy to vary depth.', glyph: G.asymPair },
  { id: 'p9', level: 2, name: 'Edge of the bed', description: 'You lie back, hips at the edge, them standing.', glyph: G.leaning },
  { id: 'p10', level: 2, name: 'Sitting embrace', description: 'They sit cross-legged, you wrap around. Slow rocking.', glyph: G.embrace },
  { id: 'p11', level: 2, name: 'Standing close', description: 'Both standing, one against a wall.', glyph: G.standClose },
  { id: 'p12', level: 2, name: 'Cross', description: 'One on side, one on back, legs crossed across.', glyph: G.crossed },
  { id: 'p13', level: 3, name: 'Bridge', description: 'They lie back, hips raised, you ride the bridge.', glyph: G.crossingCurves },
  { id: 'p14', level: 3, name: 'Pretzel', description: 'On your side, one of their legs over your hip.', glyph: G.crossed },
  { id: 'p15', level: 3, name: 'Stand and carry', description: 'They lift you, you wrap legs around.', glyph: G.standClose },
  { id: 'p16', level: 3, name: 'Reverse prone', description: 'You face down, them behind, slow weight.', glyph: G.reclining },
  { id: 'p17', level: 3, name: 'Folded', description: 'Knees up to your chest, them above.', glyph: G.oneAbove },
  { id: 'p18', level: 3, name: 'Chair', description: 'They sit on a chair, you ride facing or away.', glyph: G.facingClose },
  { id: 'p19', level: 3, name: 'On the floor, mirrored', description: 'Both on the floor, mirror in line of sight.', glyph: G.crossingCurves },
  { id: 'p20', level: 3, name: 'Slow ladder', description: 'Three positions in one — change every minute, never break contact.', glyph: G.leaning },
];

interface FlagsByDevice {
  [deviceId: string]: Record<string, true>;
}

export interface PositionsState {
  tried: FlagsByDevice;
  want: FlagsByDevice;
}

function getMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('positions');
}

export function readPositions(doc: Y.Doc): PositionsState {
  const m = getMap(doc);
  return {
    tried: { ...((m.get('tried') as FlagsByDevice | undefined) ?? {}) },
    want: { ...((m.get('want') as FlagsByDevice | undefined) ?? {}) },
  };
}

function toggle(
  doc: Y.Doc,
  field: 'tried' | 'want',
  deviceId: string,
  positionId: string,
): void {
  const m = getMap(doc);
  const existing = ((m.get(field) as FlagsByDevice | undefined) ?? {});
  const mine = { ...(existing[deviceId] ?? {}) };
  if (mine[positionId]) {
    delete mine[positionId];
  } else {
    mine[positionId] = true;
  }
  m.set(field, { ...existing, [deviceId]: mine });
}

export function toggleTried(doc: Y.Doc, deviceId: string, positionId: string): void {
  toggle(doc, 'tried', deviceId, positionId);
}

export function toggleWant(doc: Y.Doc, deviceId: string, positionId: string): void {
  toggle(doc, 'want', deviceId, positionId);
}

export function mutualWant(state: PositionsState, a: string, b: string): Position[] {
  const aWant = state.want[a] ?? {};
  const bWant = state.want[b] ?? {};
  return POSITIONS.filter((p) => aWant[p.id] && bWant[p.id]);
}

export function bothTried(state: PositionsState, a: string, b: string): Position[] {
  const aT = state.tried[a] ?? {};
  const bT = state.tried[b] ?? {};
  return POSITIONS.filter((p) => aT[p.id] && bT[p.id]);
}
