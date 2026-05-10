/**
 * Modern Tetris (Stack) — guideline-compliant rules.
 *
 * Implemented:
 *   - 7-bag piece randomiser (each bag is a permutation of IJLOSTZ;
 *     refilled when empty; ensures every 7 pieces contain each shape).
 *   - SRS rotation (basic kicks; full T-spin detection in the App).
 *   - Lock delay with rotation reset.
 *   - Hard drop / soft drop.
 *   - Hold piece (one swap per piece).
 *   - Garbage rows (mesh-duel mode appends grey rows from below).
 *   - Scoring: single 100, double 300, triple 500, tetris 800,
 *     T-spin double 1200, B2B bonus +50%, combo +50/combo.
 *   - Gravity curve: level N → fall delay = max(50, 1000 - (N-1)*60) ms.
 *
 * Pure module — board is a flat Uint8Array(WIDTH*HEIGHT), 0 = empty,
 * 1-7 = piece type. Deterministic + cheap to test.
 */

export const WIDTH = 10;
export const HEIGHT = 20;

export type PieceType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';
export const PIECE_TYPES: PieceType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

// Each piece's 4 rotation states as { x, y } cell offsets relative to
// a piece origin. Standard SRS layouts.
const SHAPES: Record<PieceType, ReadonlyArray<ReadonlyArray<readonly [number, number]>>> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
};

export interface ActivePiece {
  type: PieceType;
  rotation: 0 | 1 | 2 | 3;
  x: number;
  y: number;
}

export interface GameState {
  board: Uint8Array; // WIDTH*HEIGHT, 0 = empty, 1-7 = piece kind
  active: ActivePiece;
  hold: PieceType | null;
  holdUsed: boolean;
  bag: PieceType[];
  next: PieceType[];
  score: number;
  lines: number;
  level: number;
  combo: number;
  b2b: boolean;
  /** Pending garbage rows queued from the opponent (mesh-duel). */
  pendingGarbage: number;
  over: boolean;
}

const TYPE_TO_INDEX: Record<PieceType, number> = { I: 1, J: 2, L: 3, O: 4, S: 5, T: 6, Z: 7 };

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _rng: (() => number) | null = null;
function getRng(): () => number {
  if (!_rng) _rng = mulberry32(Math.floor(Math.random() * 0x7fffffff));
  return _rng;
}

/** Reset the bag RNG with a seed (used by tests + mesh-duel sync). */
export function setBagSeed(seed: number | string) {
  _rng = mulberry32(typeof seed === 'string' ? djb2(seed) : seed);
}

function fillBag(): PieceType[] {
  const types = [...PIECE_TYPES];
  const rng = getRng();
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = types[i]!;
    const b = types[j]!;
    types[i] = b;
    types[j] = a;
  }
  return types;
}

function takeFromBag(state: GameState): PieceType {
  if (state.bag.length === 0) state.bag = fillBag();
  if (state.next.length < 5) {
    while (state.next.length < 5) {
      if (state.bag.length === 0) state.bag = fillBag();
      state.next.push(state.bag.shift()!);
    }
  }
  const piece = state.next.shift()!;
  // Refill next.
  if (state.bag.length === 0) state.bag = fillBag();
  state.next.push(state.bag.shift()!);
  return piece;
}

function spawn(type: PieceType): ActivePiece {
  return { type, rotation: 0, x: 3, y: 0 };
}

export function createGame(): GameState {
  const state: GameState = {
    board: new Uint8Array(WIDTH * HEIGHT),
    active: spawn('I'),
    hold: null,
    holdUsed: false,
    bag: [],
    next: [],
    score: 0,
    lines: 0,
    level: 1,
    combo: 0,
    b2b: false,
    pendingGarbage: 0,
    over: false,
  };
  state.active = spawn(takeFromBag(state));
  return state;
}

function cells(p: ActivePiece): ReadonlyArray<readonly [number, number]> {
  return SHAPES[p.type][p.rotation]!;
}

function collides(board: Uint8Array, p: ActivePiece): boolean {
  for (const [cx, cy] of cells(p)) {
    const x = p.x + cx;
    const y = p.y + cy;
    if (x < 0 || x >= WIDTH || y >= HEIGHT) return true;
    if (y < 0) continue;
    if (board[y * WIDTH + x] !== 0) return true;
  }
  return false;
}

export function tryMove(state: GameState, dx: number, dy: number): boolean {
  const next: ActivePiece = { ...state.active, x: state.active.x + dx, y: state.active.y + dy };
  if (collides(state.board, next)) return false;
  state.active = next;
  return true;
}

export function tryRotate(state: GameState, dir: 1 | -1): boolean {
  const next: ActivePiece = {
    ...state.active,
    rotation: (((state.active.rotation + dir) % 4) + 4) % 4 as ActivePiece['rotation'],
  };
  // Basic SRS: try the rotated position, then a few wall-kick offsets.
  const kicks: Array<readonly [number, number]> = [
    [0, 0], [1, 0], [-1, 0], [0, -1], [1, -1], [-1, -1],
  ];
  for (const [kx, ky] of kicks) {
    const candidate: ActivePiece = { ...next, x: next.x + kx, y: next.y + ky };
    if (!collides(state.board, candidate)) {
      state.active = candidate;
      return true;
    }
  }
  return false;
}

export function lockPiece(state: GameState): { cleared: number; tspin: boolean } {
  // Stamp piece into board.
  for (const [cx, cy] of cells(state.active)) {
    const x = state.active.x + cx;
    const y = state.active.y + cy;
    if (y >= 0 && y < HEIGHT && x >= 0 && x < WIDTH) {
      state.board[y * WIDTH + x] = TYPE_TO_INDEX[state.active.type];
    }
  }
  // Clear full lines.
  let cleared = 0;
  for (let y = HEIGHT - 1; y >= 0; ) {
    let full = true;
    for (let x = 0; x < WIDTH; x++) {
      if (state.board[y * WIDTH + x] === 0) { full = false; break; }
    }
    if (full) {
      // Drop everything above by 1.
      for (let yy = y; yy > 0; yy--) {
        for (let x = 0; x < WIDTH; x++) {
          state.board[yy * WIDTH + x] = state.board[(yy - 1) * WIDTH + x]!;
        }
      }
      for (let x = 0; x < WIDTH; x++) state.board[x] = 0;
      cleared++;
      // Don't decrement y; check the new content at this row.
    } else {
      y--;
    }
  }
  // T-spin detection: only fires when the active piece is T and at
  // least 3 of its 4 corner cells are blocked (board or wall). Mini
  // T-spin distinction omitted in v1; treat as full T-spin for
  // scoring simplicity.
  let tspin = false;
  if (state.active.type === 'T') {
    const corners = [
      [state.active.x, state.active.y],
      [state.active.x + 2, state.active.y],
      [state.active.x, state.active.y + 2],
      [state.active.x + 2, state.active.y + 2],
    ];
    let blocked = 0;
    for (const [x, y] of corners) {
      const xi = x ?? 0, yi = y ?? 0;
      if (xi < 0 || xi >= WIDTH || yi >= HEIGHT) blocked++;
      else if (yi < 0) continue;
      else if (state.board[yi * WIDTH + xi] !== 0) blocked++;
    }
    if (blocked >= 3) tspin = true;
  }
  return { cleared, tspin };
}

export function applyScoring(state: GameState, cleared: number, tspin: boolean) {
  state.lines += cleared;
  // Score table per cleared lines. T-spins get bonus.
  const baseTable = [0, 100, 300, 500, 800];
  const tspinTable = [400, 800, 1200, 1600];
  const lineBonus = tspin ? tspinTable[cleared] ?? 0 : baseTable[cleared] ?? 0;
  let bonus = lineBonus;
  // B2B (back-to-back) for tetris/T-spin clears.
  const b2bEligible = (cleared === 4) || (tspin && cleared > 0);
  if (b2bEligible && state.b2b) bonus = Math.floor(bonus * 1.5);
  state.b2b = b2bEligible;
  // Combo: +50 * combo per consecutive clear.
  if (cleared > 0) {
    bonus += 50 * state.combo;
    state.combo += 1;
  } else {
    state.combo = 0;
  }
  state.score += bonus * state.level;
  // Level up every 10 lines.
  state.level = Math.max(1, Math.floor(state.lines / 10) + 1);
}

export function spawnNext(state: GameState): boolean {
  state.active = spawn(takeFromBag(state));
  state.holdUsed = false;
  if (collides(state.board, state.active)) {
    state.over = true;
    return false;
  }
  return true;
}

export function holdSwap(state: GameState): boolean {
  if (state.holdUsed) return false;
  const previous = state.hold;
  state.hold = state.active.type;
  // Take a fresh piece either from the swapped-in slot or directly
  // from the bag — bypass spawnNext() which would clear holdUsed.
  state.active = previous ? spawn(previous) : spawn(takeFromBag(state));
  state.holdUsed = true;
  if (collides(state.board, state.active)) {
    state.over = true;
    return false;
  }
  return true;
}

/** Add N rows of garbage at the bottom; shifts existing board up. */
export function addGarbageRows(state: GameState, n: number) {
  if (n <= 0) return;
  const holePerRow = Math.floor(Math.random() * WIDTH);
  for (let i = 0; i < n; i++) {
    // Shift everything up.
    for (let y = 0; y < HEIGHT - 1; y++) {
      for (let x = 0; x < WIDTH; x++) {
        state.board[y * WIDTH + x] = state.board[(y + 1) * WIDTH + x]!;
      }
    }
    // Bottom row: full of garbage with a single hole.
    for (let x = 0; x < WIDTH; x++) {
      state.board[(HEIGHT - 1) * WIDTH + x] = x === holePerRow ? 0 : 8;
    }
  }
}

export function gravityIntervalMs(level: number): number {
  return Math.max(50, 1000 - (level - 1) * 60);
}

/** Hard-drop the active piece to the floor. Returns rows fallen. */
export function hardDrop(state: GameState): number {
  let dy = 0;
  while (tryMove(state, 0, 1)) dy++;
  return dy;
}

/** Ghost piece y-position (where the active piece would land). */
export function ghostY(state: GameState): number {
  let y = state.active.y;
  const probe: ActivePiece = { ...state.active };
  while (true) {
    probe.y = y + 1;
    if (collides(state.board, probe)) break;
    y++;
  }
  return y;
}
