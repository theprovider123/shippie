export type GameLane = 'daily' | 'cabinet' | 'room' | 'strategy';

export interface ArcadeGame {
  id: string;
  name: string;
  shortName: string;
  initials: string;
  lane: GameLane;
  accent: string;
  loop: string;
  tempo: string;
  controls: string;
  description: string;
}

export interface ArcadeLane {
  id: GameLane;
  title: string;
  subtitle: string;
}

export const ARCADE_LANES: readonly ArcadeLane[] = [
  { id: 'daily', title: 'Daily Brain', subtitle: 'One puzzle, one clean streak.' },
  { id: 'cabinet', title: 'Cabinet Runs', subtitle: 'Fast hands, high scores, retries.' },
  { id: 'room', title: 'Room Games', subtitle: 'Pass the phone or gather a few screens.' },
  { id: 'strategy', title: 'Strategy', subtitle: 'Slower games with a longer tail.' },
] as const;

export const ARCADE_GAMES: readonly ArcadeGame[] = [
  {
    id: 'daily-puzzle',
    name: 'Daily Puzzle',
    shortName: 'Daily',
    initials: 'DP',
    lane: 'daily',
    accent: '#6FCF97',
    loop: 'Daily set',
    tempo: '5 min',
    controls: 'Tap',
    description: 'Number Trail, Sudoku, Memory, and Reaction in one daily brain set.',
  },
  {
    id: 'five-letter',
    name: 'Five Letter',
    shortName: 'Five',
    initials: 'FL',
    lane: 'daily',
    accent: '#7DB7FF',
    loop: 'Word daily',
    tempo: '3 min',
    controls: 'Keyboard',
    description: 'Six guesses, three languages, and a shareable solve grid.',
  },
  {
    id: 'quartet',
    name: 'Quartet',
    shortName: 'Quartet',
    initials: 'QT',
    lane: 'daily',
    accent: '#C59BFF',
    loop: 'Group words',
    tempo: '6 min',
    controls: 'Tap',
    description: 'Group sixteen words into four clean sets before mistakes run out.',
  },
  {
    id: 'sudoku',
    name: 'Sudoku',
    shortName: 'Sudoku',
    initials: 'SU',
    lane: 'daily',
    accent: '#62C7D9',
    loop: 'Logic grid',
    tempo: '10 min',
    controls: 'Tap',
    description: 'Algorithmic Sudoku with free play and deterministic daily boards.',
  },
  {
    id: 'reaction',
    name: 'Reaction',
    shortName: 'React',
    initials: 'RX',
    lane: 'daily',
    accent: '#F2B94B',
    loop: 'Tap test',
    tempo: '30 sec',
    controls: 'Tap',
    description: 'Wait for green, hit it fast, and shave milliseconds off your best.',
  },
  {
    id: 'memory-grid',
    name: 'Memory Grid',
    shortName: 'Memory',
    initials: 'MG',
    lane: 'daily',
    accent: '#8A8CFF',
    loop: 'Pair match',
    tempo: '4 min',
    controls: 'Tap',
    description: 'A card-flip memory run that grows as your recall sharpens.',
  },
  {
    id: 'snake',
    name: 'Snake',
    shortName: 'Snake',
    initials: 'SN',
    lane: 'cabinet',
    accent: '#4FA487',
    loop: 'Score run',
    tempo: 'Fast',
    controls: 'Swipe / arrows',
    description: 'Classic Snake with loop walls, daily seeds, and power-pellets.',
  },
  {
    id: 'bricks',
    name: 'Bricks',
    shortName: 'Bricks',
    initials: 'BR',
    lane: 'cabinet',
    accent: '#EC5A3D',
    loop: 'Levels',
    tempo: 'Fast',
    controls: 'Drag / arrows',
    description: 'Breakout-style brick smashing with power-ups and endless levels.',
  },
  {
    id: 'drift',
    name: 'Drift',
    shortName: 'Drift',
    initials: 'DR',
    lane: 'cabinet',
    accent: '#7CE36B',
    loop: 'Wave run',
    tempo: 'Fast',
    controls: 'Thrust',
    description: 'Vector asteroid combat: rotate, thrust, fire, and survive the wave.',
  },
  {
    id: 'maze',
    name: 'Maze',
    shortName: 'Maze',
    initials: 'MZ',
    lane: 'cabinet',
    accent: '#FFD66B',
    loop: 'Clear board',
    tempo: 'Fast',
    controls: 'Swipe / arrows',
    description: 'Maze chase with dot clears, power pellets, and four ghost styles.',
  },
  {
    id: 'invaders',
    name: 'Invaders',
    shortName: 'Invaders',
    initials: 'IV',
    lane: 'cabinet',
    accent: '#66B8FF',
    loop: 'Waves',
    tempo: 'Fast',
    controls: 'Move + fire',
    description: 'Fixed-shooter waves, eroding bunkers, and a boss every five rounds.',
  },
  {
    id: 'crossing',
    name: 'Crossing',
    shortName: 'Crossing',
    initials: 'CR',
    lane: 'cabinet',
    accent: '#59D98E',
    loop: 'Route run',
    tempo: 'Fast',
    controls: 'Swipe / arrows',
    description: 'Hop through traffic and water lanes with daily routes and unlocks.',
  },
  {
    id: 'stack',
    name: 'Stack',
    shortName: 'Stack',
    initials: 'ST',
    lane: 'cabinet',
    accent: '#4EA0C9',
    loop: 'Block run',
    tempo: 'Focused',
    controls: 'Keyboard',
    description: 'Modern falling blocks with marathon, sprint, ultra, and daily play.',
  },
  {
    id: 'block-drop',
    name: 'Block Drop',
    shortName: 'Drop',
    initials: 'BD',
    lane: 'cabinet',
    accent: '#F4B860',
    loop: 'Clear lines',
    tempo: 'Focused',
    controls: 'Drag',
    description: 'Place three shapes per round and clear rows, columns, and squares.',
  },
  {
    id: 'lustre',
    name: 'Lustre',
    shortName: 'Lustre',
    initials: 'LU',
    lane: 'cabinet',
    accent: '#D98F45',
    loop: 'Cascade',
    tempo: 'Focused',
    controls: 'Swap',
    description: 'Match-3 cascades with campaign, endless, and daily challenge loops.',
  },
  {
    id: 'drawing-telephone',
    name: 'Drawing Telephone',
    shortName: 'Draw',
    initials: 'DT',
    lane: 'room',
    accent: '#B48CFF',
    loop: 'Room chain',
    tempo: 'Party',
    controls: 'Draw',
    description: 'Draw, guess, draw again, then watch the chain unravel together.',
  },
  {
    id: 'would-you-rather',
    name: 'Would You Rather',
    shortName: 'Rather',
    initials: 'WR',
    lane: 'room',
    accent: '#6BA6C9',
    loop: 'Daily choice',
    tempo: '10 sec',
    controls: 'Tap',
    description: 'A two-option daily question that builds a local preference profile.',
  },
  {
    id: 'world-cup-fantasy',
    name: 'World Cup Fantasy',
    shortName: 'Fantasy',
    initials: 'WF',
    lane: 'room',
    accent: '#2FA66A',
    loop: 'Squad build',
    tempo: 'Season',
    controls: 'Tap',
    description: 'Private squad building with chips, captaincy, and budget pressure.',
  },
  {
    id: 'bulwark',
    name: 'Bulwark',
    shortName: 'Bulwark',
    initials: 'BU',
    lane: 'strategy',
    accent: '#74B87F',
    loop: 'Campaign',
    tempo: 'Long',
    controls: 'Tap',
    description: 'Tower defence with wave pressure, tower upgrades, and campaign play.',
  },
  {
    id: 'chess',
    name: 'Chess',
    shortName: 'Chess',
    initials: 'CH',
    lane: 'strategy',
    accent: '#BFA06A',
    loop: 'Board game',
    tempo: 'Long',
    controls: 'Tap',
    description: 'Play the computer or a local opponent, with board flip and PGN export.',
  },
] as const;

export const DEFAULT_GAME_ID = 'snake';

export function gameById(id: string | null | undefined): ArcadeGame | null {
  if (!id) return null;
  return ARCADE_GAMES.find((game) => game.id === id) ?? null;
}

export function normalizeGameId(value: string | null | undefined): string {
  return gameById(value)?.id ?? DEFAULT_GAME_ID;
}

export function gamesForLane(lane: GameLane): ArcadeGame[] {
  return ARCADE_GAMES.filter((game) => game.lane === lane);
}

export function neighborGameId(current: string, delta: -1 | 1): string {
  const index = ARCADE_GAMES.findIndex((game) => game.id === current);
  const safeIndex = index === -1 ? 0 : index;
  const next = (safeIndex + delta + ARCADE_GAMES.length) % ARCADE_GAMES.length;
  return ARCADE_GAMES[next]?.id ?? DEFAULT_GAME_ID;
}

export function childRuntimeSrc(gameId: string, search = ''): string {
  const params = new URLSearchParams(search);
  params.delete('game');
  params.delete('shippie_embed');
  params.set('shippie_embed', '1');
  params.set('arcade_shell', '1');
  const query = params.toString();
  return `/__shippie-run/${encodeURIComponent(gameId)}/${query ? `?${query}` : ''}`;
}
