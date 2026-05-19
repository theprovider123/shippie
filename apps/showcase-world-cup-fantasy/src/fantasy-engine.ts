export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';
export type Chip = 'none' | 'bench-boost' | 'triple-captain' | 'wildcard';
export type FeedStatus = 'simulated' | 'live' | 'final';

export interface Player {
  id: string;
  providerId: string;
  name: string;
  team: string;
  position: Position;
  price: number;
  projected: number;
  note: string;
}

export interface SavedTeam {
  manager: string;
  squadIds: string[];
  captainId: string | null;
  chip: Chip;
  updatedAt: string | null;
}

export interface PlayerMatchStats {
  playerId: string;
  minutes: number;
  goals: number;
  assists: number;
  keyPasses: number;
  recoveries: number;
  saves: number;
  penaltySaves: number;
  goalsConceded: number;
  cleanSheet: boolean;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  playerOfMatch: boolean;
}

export interface PlayerScoreLine {
  player: Player;
  stats: PlayerMatchStats;
  points: number;
  reasons: string[];
}

export interface LiveEvent {
  minute: string;
  playerId?: string;
  title: string;
  detail: string;
  swing: number;
  kind: 'goal' | 'assist' | 'clean-sheet' | 'card' | 'save' | 'bonus' | 'correction';
}

export interface LiveSnapshot {
  id: string;
  label: string;
  status: FeedStatus;
  updatedAt: string;
  providerMessage: string;
  events: LiveEvent[];
  stats: Record<string, PlayerMatchStats>;
}

export interface TeamScore {
  total: number;
  base: number;
  captainBonus: number;
  counting: PlayerScoreLine[];
  bench: PlayerScoreLine[];
}

export const STORAGE_KEY = 'shippie:world-cup-fantasy:v1';
export const BUDGET = 125;
export const LIMITS: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
export const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
export const CHIPS: Array<{ id: Chip; label: string; hint: string }> = [
  { id: 'none', label: 'No chip', hint: 'Keep it simple' },
  { id: 'bench-boost', label: 'Bench boost', hint: 'All 15 score' },
  { id: 'triple-captain', label: 'Triple captain', hint: 'Captain scores 3x' },
  { id: 'wildcard', label: 'Wildcard', hint: 'Reset before knockouts' },
];

export const PLAYERS: Player[] = [
  { id: 'martinez', providerId: 'bdl-wc-arg-emi-martinez', name: 'Emiliano Martinez', team: 'ARG', position: 'GK', price: 6.0, projected: 44, note: 'Penalty-save ceiling' },
  { id: 'maignan', providerId: 'bdl-wc-fra-mike-maignan', name: 'Mike Maignan', team: 'FRA', position: 'GK', price: 5.8, projected: 42, note: 'Clean sheet base' },
  { id: 'alisson', providerId: 'bdl-wc-bra-alisson', name: 'Alisson', team: 'BRA', position: 'GK', price: 5.9, projected: 40, note: 'Safe route' },
  { id: 'neuer', providerId: 'bdl-wc-ger-manuel-neuer', name: 'Manuel Neuer', team: 'GER', position: 'GK', price: 5.4, projected: 35, note: 'Tournament pedigree' },
  { id: 'hakimi', providerId: 'bdl-wc-mar-achraf-hakimi', name: 'Achraf Hakimi', team: 'MAR', position: 'DEF', price: 6.4, projected: 48, note: 'Wing threat' },
  { id: 'theo', providerId: 'bdl-wc-fra-theo-hernandez', name: 'Theo Hernandez', team: 'FRA', position: 'DEF', price: 6.2, projected: 47, note: 'Attacking full-back' },
  { id: 'saliba', providerId: 'bdl-wc-fra-william-saliba', name: 'William Saliba', team: 'FRA', position: 'DEF', price: 5.8, projected: 41, note: 'Minutes magnet' },
  { id: 'gvardiol', providerId: 'bdl-wc-cro-josko-gvardiol', name: 'Josko Gvardiol', team: 'CRO', position: 'DEF', price: 5.7, projected: 39, note: 'Set-piece threat' },
  { id: 'reijnders', providerId: 'bdl-wc-ned-denzel-dumfries', name: 'Denzel Dumfries', team: 'NED', position: 'DEF', price: 5.9, projected: 42, note: 'Chaos wingback' },
  { id: 'araujo', providerId: 'bdl-wc-uru-ronald-araujo', name: 'Ronald Araujo', team: 'URU', position: 'DEF', price: 5.3, projected: 35, note: 'Budget lock' },
  { id: 'bellingham', providerId: 'bdl-wc-eng-jude-bellingham', name: 'Jude Bellingham', team: 'ENG', position: 'MID', price: 9.8, projected: 64, note: 'Late-box runs' },
  { id: 'musiala', providerId: 'bdl-wc-ger-jamal-musiala', name: 'Jamal Musiala', team: 'GER', position: 'MID', price: 9.3, projected: 61, note: 'Dribble bonus' },
  { id: 'valverde', providerId: 'bdl-wc-uru-federico-valverde', name: 'Federico Valverde', team: 'URU', position: 'MID', price: 8.5, projected: 52, note: 'Engine plus shots' },
  { id: 'wirtz', providerId: 'bdl-wc-ger-florian-wirtz', name: 'Florian Wirtz', team: 'GER', position: 'MID', price: 8.9, projected: 57, note: 'Chance creator' },
  { id: 'pedri', providerId: 'bdl-wc-esp-pedri', name: 'Pedri', team: 'ESP', position: 'MID', price: 7.7, projected: 46, note: 'Control pick' },
  { id: 'rodrygo', providerId: 'bdl-wc-bra-rodrygo', name: 'Rodrygo', team: 'BRA', position: 'MID', price: 8.6, projected: 54, note: 'Flexible forward' },
  { id: 'mbappe', providerId: 'bdl-wc-fra-kylian-mbappe', name: 'Kylian Mbappe', team: 'FRA', position: 'FWD', price: 12.5, projected: 86, note: 'Captain default' },
  { id: 'vinicius', providerId: 'bdl-wc-bra-vinicius-jr', name: 'Vinicius Jr', team: 'BRA', position: 'FWD', price: 11.2, projected: 75, note: 'Explosive ceiling' },
  { id: 'kane', providerId: 'bdl-wc-eng-harry-kane', name: 'Harry Kane', team: 'ENG', position: 'FWD', price: 11.0, projected: 72, note: 'Penalties and minutes' },
  { id: 'haaland', providerId: 'bdl-wc-nor-erling-haaland', name: 'Erling Haaland', team: 'NOR', position: 'FWD', price: 11.4, projected: 70, note: 'If Norway land hot' },
  { id: 'lautaro', providerId: 'bdl-wc-arg-lautaro-martinez', name: 'Lautaro Martinez', team: 'ARG', position: 'FWD', price: 9.7, projected: 58, note: 'Knockout upside' },
  { id: 'gimenez', providerId: 'bdl-wc-mex-santiago-gimenez', name: 'Santiago Gimenez', team: 'MEX', position: 'FWD', price: 7.8, projected: 44, note: 'Host nation value' },
];

export const PLAYER_BY_ID = new Map(PLAYERS.map((player) => [player.id, player]));

export const RIVAL_TEAMS: Array<{ manager: string; squadIds: string[]; captainId: string; chip: Chip }> = [
  { manager: 'Sarah', captainId: 'mbappe', chip: 'triple-captain', squadIds: ['maignan', 'martinez', 'theo', 'saliba', 'hakimi', 'gvardiol', 'araujo', 'bellingham', 'musiala', 'wirtz', 'pedri', 'mbappe', 'kane', 'lautaro', 'gimenez'] },
  { manager: 'Tom', captainId: 'kane', chip: 'bench-boost', squadIds: ['neuer', 'alisson', 'hakimi', 'gvardiol', 'reijnders', 'araujo', 'saliba', 'bellingham', 'valverde', 'wirtz', 'rodrygo', 'kane', 'vinicius', 'lautaro', 'gimenez'] },
  { manager: 'Maya', captainId: 'vinicius', chip: 'none', squadIds: ['alisson', 'maignan', 'theo', 'saliba', 'gvardiol', 'hakimi', 'reijnders', 'bellingham', 'musiala', 'valverde', 'rodrygo', 'vinicius', 'mbappe', 'haaland', 'lautaro'] },
];

const EMPTY_STATS: Omit<PlayerMatchStats, 'playerId'> = {
  minutes: 0,
  goals: 0,
  assists: 0,
  keyPasses: 0,
  recoveries: 0,
  saves: 0,
  penaltySaves: 0,
  goalsConceded: 0,
  cleanSheet: false,
  yellowCards: 0,
  redCards: 0,
  ownGoals: 0,
  playerOfMatch: false,
};

export function emptyPlayerStats(playerId: string): PlayerMatchStats {
  return { playerId, ...EMPTY_STATS };
}

function stat(playerId: string, input: Partial<Omit<PlayerMatchStats, 'playerId'>>): PlayerMatchStats {
  return { playerId, ...EMPTY_STATS, ...input };
}

export const LIVE_SNAPSHOTS: LiveSnapshot[] = [
  {
    id: 'pre',
    label: 'Pre-match',
    status: 'simulated',
    updatedAt: '20:00',
    providerMessage: 'Provider IDs mapped. Waiting for lineups and events.',
    events: [],
    stats: {},
  },
  {
    id: 'fra-goal',
    label: "34'",
    status: 'simulated',
    updatedAt: '20:34',
    providerMessage: 'Raw event snapshot normalised from match_events + player_match_stats.',
    events: [
      { minute: "34'", playerId: 'mbappe', title: 'Mbappe goal', detail: 'Forward goal +4. Triple captain managers are flying.', swing: 4, kind: 'goal' },
      { minute: "34'", playerId: 'theo', title: 'Theo assist', detail: 'Assist +3. France defenders also hold clean-sheet points for now.', swing: 3, kind: 'assist' },
      { minute: "34'", playerId: 'maignan', title: 'Maignan clean sheet live', detail: 'Keeper currently banking appearance and clean-sheet points.', swing: 6, kind: 'clean-sheet' },
    ],
    stats: {
      mbappe: stat('mbappe', { minutes: 90, goals: 1, keyPasses: 2 }),
      theo: stat('theo', { minutes: 90, assists: 1, keyPasses: 2, recoveries: 7, cleanSheet: true }),
      saliba: stat('saliba', { minutes: 90, recoveries: 8, cleanSheet: true }),
      maignan: stat('maignan', { minutes: 90, saves: 2, cleanSheet: true }),
      bellingham: stat('bellingham', { minutes: 90, keyPasses: 1, recoveries: 4 }),
      kane: stat('kane', { minutes: 90 }),
    },
  },
  {
    id: 'eng-equaliser',
    label: "63'",
    status: 'simulated',
    updatedAt: '21:03',
    providerMessage: 'VAR confirmed. Recalculated from source stats, not stacked deltas.',
    events: [
      { minute: "34'", playerId: 'mbappe', title: 'Mbappe goal', detail: 'Forward goal +4 remains confirmed.', swing: 4, kind: 'goal' },
      { minute: "63'", playerId: 'kane', title: 'Kane equaliser', detail: 'Forward goal +4. Rival captains move.', swing: 4, kind: 'goal' },
      { minute: "63'", playerId: 'bellingham', title: 'Bellingham assist', detail: 'Assist +3 plus recovery work.', swing: 3, kind: 'assist' },
      { minute: "63'", playerId: 'maignan', title: 'France clean sheet lost', detail: 'Maignan, Theo, and Saliba lose clean-sheet points.', swing: -4, kind: 'correction' },
    ],
    stats: {
      mbappe: stat('mbappe', { minutes: 90, goals: 1, keyPasses: 2 }),
      theo: stat('theo', { minutes: 90, assists: 1, keyPasses: 2, recoveries: 7, goalsConceded: 1 }),
      saliba: stat('saliba', { minutes: 90, recoveries: 8, goalsConceded: 1 }),
      maignan: stat('maignan', { minutes: 90, saves: 3, goalsConceded: 1 }),
      bellingham: stat('bellingham', { minutes: 90, assists: 1, keyPasses: 2, recoveries: 8 }),
      kane: stat('kane', { minutes: 90, goals: 1, keyPasses: 1 }),
    },
  },
  {
    id: 'full-time',
    label: 'FT',
    status: 'final',
    updatedAt: '21:56',
    providerMessage: 'Full-time snapshot locked after correction window. Scores marked final.',
    events: [
      { minute: "34'", playerId: 'mbappe', title: 'Mbappe goal', detail: 'Goal +4, player of match +3.', swing: 7, kind: 'bonus' },
      { minute: "63'", playerId: 'kane', title: 'Kane goal', detail: 'Goal +4. Captain managers stay alive.', swing: 4, kind: 'goal' },
      { minute: "78'", playerId: 'martinez', title: 'Martinez penalty save', detail: 'Penalty save +5 and save bonus +1.', swing: 6, kind: 'save' },
      { minute: "88'", playerId: 'hakimi', title: 'Hakimi assist', detail: 'Defender assist +3, key passes +1.', swing: 4, kind: 'assist' },
    ],
    stats: {
      martinez: stat('martinez', { minutes: 90, saves: 4, penaltySaves: 1, goalsConceded: 1 }),
      maignan: stat('maignan', { minutes: 90, saves: 4, goalsConceded: 1 }),
      alisson: stat('alisson', { minutes: 90, saves: 3, cleanSheet: true }),
      neuer: stat('neuer', { minutes: 90, saves: 2, goalsConceded: 2 }),
      hakimi: stat('hakimi', { minutes: 90, assists: 1, keyPasses: 3, recoveries: 6, goalsConceded: 1 }),
      theo: stat('theo', { minutes: 90, assists: 1, keyPasses: 2, recoveries: 7, goalsConceded: 1 }),
      saliba: stat('saliba', { minutes: 90, recoveries: 8, goalsConceded: 1 }),
      gvardiol: stat('gvardiol', { minutes: 90, keyPasses: 1, recoveries: 9, cleanSheet: true }),
      reijnders: stat('reijnders', { minutes: 90, keyPasses: 2, recoveries: 6, goalsConceded: 1 }),
      araujo: stat('araujo', { minutes: 90, recoveries: 10, cleanSheet: true, yellowCards: 1 }),
      bellingham: stat('bellingham', { minutes: 90, assists: 1, keyPasses: 2, recoveries: 8 }),
      musiala: stat('musiala', { minutes: 84, keyPasses: 4, recoveries: 5 }),
      valverde: stat('valverde', { minutes: 90, keyPasses: 1, recoveries: 11, yellowCards: 1 }),
      wirtz: stat('wirtz', { minutes: 77, assists: 1, keyPasses: 3 }),
      pedri: stat('pedri', { minutes: 73, keyPasses: 2, recoveries: 6 }),
      rodrygo: stat('rodrygo', { minutes: 82, goals: 1, keyPasses: 2 }),
      mbappe: stat('mbappe', { minutes: 90, goals: 1, keyPasses: 3, playerOfMatch: true }),
      vinicius: stat('vinicius', { minutes: 90, goals: 1, assists: 1, keyPasses: 2 }),
      kane: stat('kane', { minutes: 90, goals: 1, keyPasses: 1 }),
      haaland: stat('haaland', { minutes: 90, goals: 2 }),
      lautaro: stat('lautaro', { minutes: 68, goals: 1, yellowCards: 1 }),
      gimenez: stat('gimenez', { minutes: 74, assists: 1, keyPasses: 2 }),
    },
  },
];

export function liveSnapshotAt(index: number): LiveSnapshot {
  return LIVE_SNAPSHOTS[index] ?? LIVE_SNAPSHOTS[0]!;
}

export function scorePlayer(player: Player, snapshot: LiveSnapshot): PlayerScoreLine {
  const stats = snapshot.stats[player.id] ?? emptyPlayerStats(player.id);
  const reasons: string[] = [];
  let points = 0;

  if (stats.minutes > 0) {
    const value = stats.minutes >= 60 ? 2 : 1;
    points += value;
    reasons.push(`${stats.minutes} mins +${value}`);
  }

  if (stats.goals > 0) {
    const perGoal = player.position === 'GK' ? 10 : player.position === 'DEF' ? 6 : player.position === 'MID' ? 5 : 4;
    points += stats.goals * perGoal;
    reasons.push(`${stats.goals} goal${plural(stats.goals)} +${stats.goals * perGoal}`);
  }

  if (stats.assists > 0) {
    points += stats.assists * 3;
    reasons.push(`${stats.assists} assist${plural(stats.assists)} +${stats.assists * 3}`);
  }

  if (stats.cleanSheet && stats.minutes >= 60) {
    const value = player.position === 'GK' || player.position === 'DEF' ? 4 : player.position === 'MID' ? 1 : 0;
    if (value) {
      points += value;
      reasons.push(`clean sheet +${value}`);
    }
  }

  if ((player.position === 'GK' || player.position === 'DEF') && stats.goalsConceded >= 2) {
    const value = Math.floor(stats.goalsConceded / 2);
    points -= value;
    reasons.push(`${stats.goalsConceded} conceded -${value}`);
  }

  if (player.position === 'GK' && stats.saves >= 3) {
    const value = Math.floor(stats.saves / 3);
    points += value;
    reasons.push(`${stats.saves} saves +${value}`);
  }

  if (stats.penaltySaves > 0) {
    points += stats.penaltySaves * 5;
    reasons.push(`${stats.penaltySaves} penalty save${plural(stats.penaltySaves)} +${stats.penaltySaves * 5}`);
  }

  const keyPassBonus = Math.floor(stats.keyPasses / 3);
  if (keyPassBonus > 0) {
    points += keyPassBonus;
    reasons.push(`${stats.keyPasses} key passes +${keyPassBonus}`);
  }

  const recoveryBonus = Math.floor(stats.recoveries / 5);
  if (recoveryBonus > 0) {
    points += recoveryBonus;
    reasons.push(`${stats.recoveries} recoveries +${recoveryBonus}`);
  }

  if (stats.playerOfMatch) {
    points += 3;
    reasons.push('player of match +3');
  }

  const deductions = stats.yellowCards + stats.redCards * 3 + stats.ownGoals * 2;
  if (deductions > 0) {
    points -= deductions;
    reasons.push(`cards/errors -${deductions}`);
  }

  return { player, stats, points, reasons: reasons.length ? reasons : ['No live score yet'] };
}

export function scoreFantasyTeam(players: Player[], captainId: string | null, chip: Chip, snapshot: LiveSnapshot): TeamScore {
  const scored = players.map((player) => scorePlayer(player, snapshot)).sort((a, b) => b.points - a.points || b.player.projected - a.player.projected);
  const counting = chip === 'bench-boost' ? scored : scored.slice(0, 11);
  const bench = chip === 'bench-boost' ? [] : scored.slice(11);
  const base = counting.reduce((total, line) => total + line.points, 0);
  const captainLine = scored.find((line) => line.player.id === captainId);
  const captainMultiplier = chip === 'triple-captain' ? 2 : 1;
  const captainBonus = captainLine ? captainLine.points * captainMultiplier : 0;
  return { total: base + captainBonus, base, captainBonus, counting, bench };
}

export function scoutTips(players: Player[], captainId: string | null, chip: Chip, snapshot: LiveSnapshot): string[] {
  const scored = players.map((player) => scorePlayer(player, snapshot)).sort((a, b) => b.points - a.points);
  const captainLine = captainId ? scored.find((line) => line.player.id === captainId) : null;
  const best = scored[0];
  const tips: string[] = [];
  if (best && (!captainLine || best.points > captainLine.points + 3)) {
    tips.push(`${best.player.name} is your best live captain by ${best.points} points.`);
  }
  if (chip === 'bench-boost') {
    tips.push('Bench boost is active, so all 15 players count.');
  } else if (scored.length > 11 && scored.slice(11).some((line) => line.points >= 6)) {
    tips.push('You have a strong score on the bench. Bench boost would matter here.');
  }
  const noMinutes = players.filter((player) => (snapshot.stats[player.id]?.minutes ?? 0) === 0).length;
  if (noMinutes > 0) tips.push(`${noMinutes} selected player${plural(noMinutes)} still need lineups or minutes.`);
  if (tips.length === 0) tips.push('Squad shape is balanced. Watch captaincy and late lineup news.');
  return tips.slice(0, 3);
}

export function providerReadiness(players: Player[]): Array<{ label: string; value: string; detail: string }> {
  const mapped = players.filter((player) => player.providerId).length;
  return [
    { label: 'Provider IDs', value: `${mapped}/${players.length}`, detail: 'Every player needs a stable external ID before kickoff.' },
    { label: 'Raw snapshots', value: 'Event sourced', detail: 'Store events and stats, then recalculate points from source.' },
    { label: 'Corrections', value: 'Supported', detail: 'VAR and assist changes replace old snapshots instead of adding double points.' },
  ];
}

export function isChip(value: unknown): value is Chip {
  return value === 'none' || value === 'bench-boost' || value === 'triple-captain' || value === 'wildcard';
}

function plural(count: number): string {
  return count === 1 ? '' : 's';
}
