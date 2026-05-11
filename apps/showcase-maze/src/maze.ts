/**
 * Hand-authored maze for Shippie Maze.
 *
 * Tile legend:
 *   # — wall
 *   . — dot
 *   o — power pellet
 *   = — pen door (passable by ghosts only)
 *   p — pen interior (ghost respawn point)
 *   S — player start
 *   space — empty (no dot, walkable)
 *   T — tunnel exit (wraps to opposite side on same row)
 *
 * 20×22 grid. Wider than tall so it reads as a classic Pac-Man-ish
 * playfield on a phone in portrait. Outer walls solid, ghost pen
 * centred, 4 power pellets in the corners.
 */

export const MAZE_W = 20;
export const MAZE_H = 22;

export type Tile = '#' | '.' | 'o' | '=' | 'p' | 'S' | ' ' | 'T';

const RAW: readonly string[] = [
  '####################',
  '#........##........#',
  '#o##.###.##.###.##o#',
  '#.................. ',
  '#.##.#.######.#.##.#',
  '#....#...##...#....#',
  '####.### ## ###.####',
  '   #.#        #.#   ',
  '####.# ##==## #.####',
  'T....  #pppp#  ....T',
  '####.# ###### #.####',
  '   #.#        #.#   ',
  '####.# ###### #.####',
  '#........##........#',
  '#.##.###.##.###.##.#',
  '#o.#...... ......#o#',
  '##.#.#.######.#.#.##',
  '#....#...##...#....#',
  '#.######.##.######.#',
  '#........S.........#',
  '####################',
  '                    ',
];

if (RAW.length !== MAZE_H) {
  throw new Error(`Maze layout has ${RAW.length} rows, expected ${MAZE_H}`);
}
for (const row of RAW) {
  if (row.length !== MAZE_W) {
    throw new Error(`Maze row has ${row.length} cols, expected ${MAZE_W}`);
  }
}

/**
 * Parse the raw legend into a tile grid. Returns metadata pieces the
 * engine needs upfront: dot/pellet counts, the player start cell, the
 * pen interior cell, the tunnel-exit columns on each row.
 */
export interface ParsedMaze {
  tiles: Tile[][];
  dotCount: number;
  pelletCount: number;
  playerStart: { col: number; row: number };
  penCells: Array<{ col: number; row: number }>;
  /** Per-row: the two columns that should wrap to each other (or null). */
  tunnels: ReadonlyArray<readonly [number, number] | null>;
}

export function parseMaze(): ParsedMaze {
  const tiles: Tile[][] = [];
  const penCells: Array<{ col: number; row: number }> = [];
  const tunnels: Array<readonly [number, number] | null> = [];
  let dotCount = 0;
  let pelletCount = 0;
  let playerStart: { col: number; row: number } = { col: 10, row: 19 };
  for (let r = 0; r < MAZE_H; r++) {
    const row: Tile[] = [];
    let tunnelLeft = -1;
    let tunnelRight = -1;
    for (let c = 0; c < MAZE_W; c++) {
      const ch = RAW[r]!.charAt(c) as Tile;
      row.push(ch);
      if (ch === '.') dotCount += 1;
      else if (ch === 'o') pelletCount += 1;
      else if (ch === 'p') penCells.push({ col: c, row: r });
      else if (ch === 'S') playerStart = { col: c, row: r };
      else if (ch === 'T') {
        if (tunnelLeft < 0) tunnelLeft = c;
        else tunnelRight = c;
      }
    }
    tunnels.push(tunnelLeft >= 0 && tunnelRight >= 0 ? [tunnelLeft, tunnelRight] as const : null);
    tiles.push(row);
  }
  return { tiles, dotCount, pelletCount, playerStart, penCells, tunnels };
}

export function isWall(tile: Tile, allowDoor = false): boolean {
  if (tile === '#') return true;
  if (tile === '=') return !allowDoor;
  return false;
}

export function inBounds(col: number, row: number): boolean {
  return col >= 0 && col < MAZE_W && row >= 0 && row < MAZE_H;
}

/**
 * BFS from `start` to `goal` over the maze grid. Returns the next-step
 * direction (toward the first cell on the shortest path), or null if
 * no path exists. `allowDoor=true` lets ghosts cross the pen door.
 */
export type Direction = 'N' | 'E' | 'S' | 'W';
const DELTAS: Record<Direction, { dc: number; dr: number }> = {
  N: { dc: 0, dr: -1 },
  S: { dc: 0, dr: 1 },
  E: { dc: 1, dr: 0 },
  W: { dc: -1, dr: 0 },
};

export function bfsNextStep(
  tiles: Tile[][],
  start: { col: number; row: number },
  goal: { col: number; row: number },
  allowDoor = false,
  forbiddenDir?: Direction,
): Direction | null {
  if (start.col === goal.col && start.row === goal.row) return null;
  const visited = new Set<string>();
  const queue: Array<{ col: number; row: number; firstDir: Direction | null }> = [
    { col: start.col, row: start.row, firstDir: null },
  ];
  visited.add(`${start.col},${start.row}`);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const dir of ['N', 'E', 'S', 'W'] as Direction[]) {
      if (cur.firstDir === null && forbiddenDir && dir === forbiddenDir) continue;
      const d = DELTAS[dir];
      const nc = cur.col + d.dc;
      const nr = cur.row + d.dr;
      if (!inBounds(nc, nr)) continue;
      const tile = tiles[nr]![nc]!;
      if (isWall(tile, allowDoor)) continue;
      const key = `${nc},${nr}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const firstDir = cur.firstDir ?? dir;
      if (nc === goal.col && nr === goal.row) return firstDir;
      queue.push({ col: nc, row: nr, firstDir });
    }
  }
  return null;
}

export const ALL_DIRECTIONS: Direction[] = ['N', 'E', 'S', 'W'];
export const OPPOSITE: Record<Direction, Direction> = { N: 'S', S: 'N', E: 'W', W: 'E' };
