import { TEAMS, type Fixture } from '../data/tournament.ts';

export type FantasyPosition = 'GKP' | 'DEF' | 'MID' | 'FWD';
export type FantasyChip = 'wildcard' | 'free-hit' | 'bench-boost' | 'triple-captain';
export type FantasyPhase = 'group' | 'knockout';

export interface FantasyPlayer {
  id: string;
  name: string;
  teamCode: string;
  position: FantasyPosition;
  price: number;
  popularity: number;
}

export interface FantasySquad {
  playerIds: string[];
  startingIds: string[];
  benchIds: string[];
  captainId: string | null;
  viceCaptainId: string | null;
  bank: number;
}

export interface FantasyTeam {
  id: string;
  managerId: string;
  managerName: string;
  squad: FantasySquad;
  freeTransfers: number;
  chipsUsed: Partial<Record<FantasyPhase, FantasyChip[]>>;
  points: number;
  updatedAt: number;
}

export interface FantasyTransfer {
  outPlayerId: string;
  inPlayerId: string;
  pointsHit: number;
}

export interface PlayerAppearance {
  playerId: string;
  minutes: number;
  goals?: number;
  assists?: number;
  cleanSheet?: boolean;
  saves?: number;
  penaltySaves?: number;
  penaltyMisses?: number;
  defensiveContributions?: number;
  bonus?: 0 | 1 | 2 | 3;
  goalsConceded?: number;
  yellowCards?: number;
  redCards?: number;
  ownGoals?: number;
}

export interface FantasyValidation {
  valid: boolean;
  errors: string[];
}

export interface FantasyRoundRecap {
  total: number;
  captainPoints: number;
  benchPoints: number;
  topPlayer: { playerId: string; points: number } | null;
}

export const FPL_SQUAD_SIZE = 15;
export const FPL_BUDGET = 1000;
export const FPL_MAX_PER_TEAM = 3;

export const FPL_POSITION_QUOTAS: Record<FantasyPosition, number> = {
  GKP: 2,
  DEF: 5,
  MID: 5,
  FWD: 3,
};

const POSITION_ORDER: FantasyPosition[] = ['GKP', 'DEF', 'MID', 'FWD'];

export function buildTournamentFantasyPlayerPool(): FantasyPlayer[] {
  return TEAMS.flatMap((team, teamIndex) => {
    const basePopularity = 100 - (teamIndex % 12) * 3;
    return [
      player(team.code, 'GKP', 1, 45 + (teamIndex % 3) * 5, basePopularity - 4),
      player(team.code, 'GKP', 2, 40, basePopularity - 18),
      ...range(1, 8).map((n) => player(team.code, 'DEF', n, 40 + ((teamIndex + n) % 5) * 5, basePopularity - n)),
      ...range(1, 8).map((n) => player(team.code, 'MID', n, 45 + ((teamIndex + n) % 7) * 5, basePopularity + 4 - n)),
      ...range(1, 5).map((n) => player(team.code, 'FWD', n, 50 + ((teamIndex + n) % 6) * 5, basePopularity + 2 - n)),
    ];
  });
}

export function autoPickSquad(
  pool: readonly FantasyPlayer[],
  seed: string,
  preferredTeams: readonly string[] = [],
): FantasySquad {
  const ordered = [...pool].sort((a, b) => rankPlayer(b, seed, preferredTeams) - rankPlayer(a, seed, preferredTeams));
  const picked: FantasyPlayer[] = [];
  const teamCounts = new Map<string, number>();
  let spent = 0;

  for (const position of POSITION_ORDER) {
    const quota = FPL_POSITION_QUOTAS[position];
    for (const candidate of ordered.filter((item) => item.position === position)) {
      if (picked.filter((item) => item.position === position).length >= quota) break;
      if ((teamCounts.get(candidate.teamCode) ?? 0) >= FPL_MAX_PER_TEAM) continue;
      if (spent + candidate.price > FPL_BUDGET) continue;
      picked.push(candidate);
      spent += candidate.price;
      teamCounts.set(candidate.teamCode, (teamCounts.get(candidate.teamCode) ?? 0) + 1);
    }
  }

  if (picked.length !== FPL_SQUAD_SIZE) {
    throw new Error('could not build a legal fantasy squad from player pool');
  }

  const starters = chooseStartingEleven(picked);
  const bench = picked.filter((item) => !starters.includes(item)).sort((a, b) => positionRank(a.position) - positionRank(b.position));
  const captain = starters.find((item) => item.position === 'FWD') ?? starters.find((item) => item.position === 'MID') ?? starters[0]!;
  const vice = starters.find((item) => item.id !== captain.id && item.position === 'MID') ?? starters.find((item) => item.id !== captain.id) ?? null;
  return {
    playerIds: picked.map((item) => item.id),
    startingIds: starters.map((item) => item.id),
    benchIds: bench.map((item) => item.id),
    captainId: captain.id,
    viceCaptainId: vice?.id ?? null,
    bank: FPL_BUDGET - spent,
  };
}

export function validateFantasySquad(squad: FantasySquad, pool: readonly FantasyPlayer[]): FantasyValidation {
  const errors: string[] = [];
  const byId = new Map(pool.map((item) => [item.id, item]));
  const players = squad.playerIds.map((id) => byId.get(id)).filter((item): item is FantasyPlayer => Boolean(item));
  const starters = squad.startingIds.map((id) => byId.get(id)).filter((item): item is FantasyPlayer => Boolean(item));
  const bench = squad.benchIds.map((id) => byId.get(id)).filter((item): item is FantasyPlayer => Boolean(item));

  if (squad.playerIds.length !== FPL_SQUAD_SIZE || new Set(squad.playerIds).size !== FPL_SQUAD_SIZE) errors.push('Pick 15 unique players.');
  if (starters.length !== 11) errors.push('Start 11 players.');
  if (bench.length !== 4) errors.push('Order four bench players.');
  if (spentBy(players) > FPL_BUDGET) errors.push('Stay inside the £100.0m budget.');

  for (const position of POSITION_ORDER) {
    const count = players.filter((item) => item.position === position).length;
    if (count !== FPL_POSITION_QUOTAS[position]) errors.push(`${position} quota must be ${FPL_POSITION_QUOTAS[position]}.`);
  }

  const teamCounts = countBy(players, (item) => item.teamCode);
  for (const [team, count] of teamCounts) {
    if (count > FPL_MAX_PER_TEAM) errors.push(`Max three players from ${team}.`);
  }

  const starterCounts = countBy(starters, (item) => item.position);
  if ((starterCounts.get('GKP') ?? 0) !== 1) errors.push('Start exactly one goalkeeper.');
  if ((starterCounts.get('DEF') ?? 0) < 3) errors.push('Start at least three defenders.');
  if ((starterCounts.get('MID') ?? 0) < 2) errors.push('Start at least two midfielders.');
  if ((starterCounts.get('FWD') ?? 0) < 1) errors.push('Start at least one forward.');
  if (squad.captainId && !squad.startingIds.includes(squad.captainId)) errors.push('Captain must be in the starting XI.');
  if (squad.viceCaptainId && !squad.startingIds.includes(squad.viceCaptainId)) errors.push('Vice-captain must be in the starting XI.');
  if (squad.captainId && squad.captainId === squad.viceCaptainId) errors.push('Captain and vice-captain must differ.');

  return { valid: errors.length === 0, errors };
}

export function scorePlayerAppearance(player: FantasyPlayer, appearance: PlayerAppearance): number {
  let total = appearance.minutes >= 60 ? 2 : appearance.minutes > 0 ? 1 : 0;
  const goals = appearance.goals ?? 0;
  if (player.position === 'GKP') total += goals * 10;
  if (player.position === 'DEF') total += goals * 6;
  if (player.position === 'MID') total += goals * 5;
  if (player.position === 'FWD') total += goals * 4;
  total += (appearance.assists ?? 0) * 3;
  if (appearance.cleanSheet && appearance.minutes >= 60 && (player.position === 'GKP' || player.position === 'DEF')) total += 4;
  if (appearance.cleanSheet && appearance.minutes >= 60 && player.position === 'MID') total += 1;
  if (player.position === 'GKP') total += Math.floor((appearance.saves ?? 0) / 3);
  total += (appearance.penaltySaves ?? 0) * 5;
  total -= (appearance.penaltyMisses ?? 0) * 2;
  const contributionTarget = player.position === 'DEF' ? 10 : player.position === 'MID' || player.position === 'FWD' ? 12 : Infinity;
  if ((appearance.defensiveContributions ?? 0) >= contributionTarget) total += 2;
  if (player.position === 'GKP' || player.position === 'DEF') total -= Math.floor((appearance.goalsConceded ?? 0) / 2);
  total -= appearance.yellowCards ?? 0;
  total -= (appearance.redCards ?? 0) * 3;
  total -= (appearance.ownGoals ?? 0) * 2;
  total += appearance.bonus ?? 0;
  return total;
}

export function scoreFantasyTeam(
  team: FantasyTeam,
  pool: readonly FantasyPlayer[],
  appearances: readonly PlayerAppearance[],
  chip: FantasyChip | null = null,
): number {
  const players = new Map(pool.map((item) => [item.id, item]));
  const appearanceByPlayer = new Map(appearances.map((item) => [item.playerId, item]));
  const scoringIds = chip === 'bench-boost' ? team.squad.playerIds : team.squad.startingIds;
  let total = 0;

  for (const playerId of scoringIds) {
    const player = players.get(playerId);
    const appearance = appearanceByPlayer.get(playerId);
    if (!player || !appearance) continue;
    let points = scorePlayerAppearance(player, appearance);
    if (playerId === team.squad.captainId) points *= chip === 'triple-captain' ? 3 : 2;
    total += points;
  }

  return total;
}

export function suggestTransfer(
  squad: FantasySquad,
  pool: readonly FantasyPlayer[],
  seed: string,
  preferredTeams: readonly string[] = [],
  freeTransfers = 1,
): FantasyTransfer | null {
  const byId = new Map(pool.map((item) => [item.id, item]));
  const current = squad.playerIds.map((id) => byId.get(id)).filter((item): item is FantasyPlayer => Boolean(item));
  const squadSet = new Set(squad.playerIds);
  const teamCounts = countBy(current, (item) => item.teamCode);
  const rankedOut = [...current].sort((a, b) => rankPlayer(a, seed, preferredTeams) - rankPlayer(b, seed, preferredTeams));

  for (const outgoing of rankedOut) {
    const budgetAfterSale = squad.bank + outgoing.price;
    teamCounts.set(outgoing.teamCode, Math.max(0, (teamCounts.get(outgoing.teamCode) ?? 1) - 1));
    const incoming = [...pool]
      .filter((candidate) => candidate.position === outgoing.position)
      .filter((candidate) => !squadSet.has(candidate.id))
      .filter((candidate) => candidate.price <= budgetAfterSale)
      .filter((candidate) => (teamCounts.get(candidate.teamCode) ?? 0) < FPL_MAX_PER_TEAM)
      .sort((a, b) => rankPlayer(b, seed, preferredTeams) - rankPlayer(a, seed, preferredTeams))[0];
    teamCounts.set(outgoing.teamCode, (teamCounts.get(outgoing.teamCode) ?? 0) + 1);
    if (!incoming || rankPlayer(incoming, seed, preferredTeams) <= rankPlayer(outgoing, seed, preferredTeams)) continue;
    return {
      outPlayerId: outgoing.id,
      inPlayerId: incoming.id,
      pointsHit: freeTransfers > 0 ? 0 : 4,
    };
  }

  return null;
}

export function applyTransfer(
  squad: FantasySquad,
  pool: readonly FantasyPlayer[],
  transfer: FantasyTransfer,
): FantasySquad {
  const byId = new Map(pool.map((item) => [item.id, item]));
  const outgoing = byId.get(transfer.outPlayerId);
  const incoming = byId.get(transfer.inPlayerId);
  if (!outgoing || !incoming || outgoing.position !== incoming.position) return squad;

  const replace = (ids: readonly string[]) => ids.map((id) => (id === transfer.outPlayerId ? transfer.inPlayerId : id));
  return {
    playerIds: replace(squad.playerIds),
    startingIds: replace(squad.startingIds),
    benchIds: replace(squad.benchIds),
    captainId: squad.captainId === transfer.outPlayerId ? transfer.inPlayerId : squad.captainId,
    viceCaptainId: squad.viceCaptainId === transfer.outPlayerId ? transfer.inPlayerId : squad.viceCaptainId,
    bank: squad.bank + outgoing.price - incoming.price,
  };
}

export function nextFreeTransferCount(current: number, usedThisRound: number, chip: FantasyChip | null = null): number {
  if (chip === 'wildcard' || chip === 'free-hit') return Math.min(5, current + 1);
  return Math.min(5, Math.max(0, current - usedThisRound) + 1);
}

export function buildRoundRecap(
  team: FantasyTeam,
  pool: readonly FantasyPlayer[],
  appearances: readonly PlayerAppearance[],
  chip: FantasyChip | null = null,
): FantasyRoundRecap {
  const players = new Map(pool.map((item) => [item.id, item]));
  const appearanceByPlayer = new Map(appearances.map((item) => [item.playerId, item]));
  let topPlayer: FantasyRoundRecap['topPlayer'] = null;
  let captainPoints = 0;
  let benchPoints = 0;

  for (const playerId of team.squad.playerIds) {
    const player = players.get(playerId);
    const appearance = appearanceByPlayer.get(playerId);
    if (!player || !appearance) continue;
    const points = scorePlayerAppearance(player, appearance);
    if (!topPlayer || points > topPlayer.points) topPlayer = { playerId, points };
    if (playerId === team.squad.captainId) captainPoints = points * (chip === 'triple-captain' ? 3 : 2);
    if (team.squad.benchIds.includes(playerId)) benchPoints += points;
  }

  return {
    total: scoreFantasyTeam(team, pool, appearances, chip),
    captainPoints,
    benchPoints,
    topPlayer,
  };
}

export function isFantasyLocked(now: number, deadline: string | number | Date): boolean {
  return now >= new Date(deadline).getTime();
}

export function phaseForFixture(fixture: Fixture): FantasyPhase {
  return fixture.stage.toLowerCase().includes('group') ? 'group' : 'knockout';
}

function player(teamCode: string, position: FantasyPosition, index: number, price: number, popularity: number): FantasyPlayer {
  const label = position === 'GKP' ? 'Keeper' : position === 'DEF' ? 'Defender' : position === 'MID' ? 'Midfielder' : 'Forward';
  return {
    id: `${teamCode}_${position}_${index}`,
    name: `${teamCode} ${label} ${index}`,
    teamCode,
    position,
    price,
    popularity: Math.max(1, popularity),
  };
}

function chooseStartingEleven(players: readonly FantasyPlayer[]): FantasyPlayer[] {
  const starters: FantasyPlayer[] = [
    ...players.filter((item) => item.position === 'GKP').slice(0, 1),
    ...players.filter((item) => item.position === 'DEF').slice(0, 4),
    ...players.filter((item) => item.position === 'MID').slice(0, 4),
    ...players.filter((item) => item.position === 'FWD').slice(0, 2),
  ];
  return starters.slice(0, 11);
}

function spentBy(players: readonly FantasyPlayer[]): number {
  return players.reduce((sum, item) => sum + item.price, 0);
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

function rankPlayer(player: FantasyPlayer, seed: string, preferredTeams: readonly string[]): number {
  const teamBias = preferredTeams.includes(player.teamCode) ? 35 : 0;
  return player.popularity + teamBias + (hash(`${seed}:${player.id}`) % 20) - player.price / 20;
}

function positionRank(position: FantasyPosition): number {
  return POSITION_ORDER.indexOf(position);
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

function hash(value: string): number {
  let state = 2166136261;
  for (const char of value) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return state >>> 0;
}
