import { describe, expect, test } from 'bun:test';
import {
  autoPickSquad,
  applyTransfer,
  buildRoundRecap,
  buildTournamentFantasyPlayerPool,
  FPL_BUDGET,
  isFantasyLocked,
  nextFreeTransferCount,
  scoreFantasyTeam,
  scorePlayerAppearance,
  suggestTransfer,
  validateFantasySquad,
  type FantasyTeam,
  type PlayerAppearance,
} from './fpl-rules.ts';

describe('Match Room fantasy rules', () => {
  test('auto-picks a legal FPL-style 15-man squad', () => {
    const pool = buildTournamentFantasyPlayerPool();
    const squad = autoPickSquad(pool, 'room-1', ['ENG', 'BRA']);
    const validation = validateFantasySquad(squad, pool);

    expect(validation.valid).toBe(true);
    expect(squad.playerIds).toHaveLength(15);
    expect(squad.startingIds).toHaveLength(11);
    expect(squad.benchIds).toHaveLength(4);
    expect(squad.bank).toBeGreaterThanOrEqual(0);
    expect(FPL_BUDGET - squad.bank).toBeLessThanOrEqual(FPL_BUDGET);
  });

  test('scores appearances using FPL-style position rules', () => {
    const pool = buildTournamentFantasyPlayerPool();
    const defender = pool.find((item) => item.position === 'DEF')!;
    const forward = pool.find((item) => item.position === 'FWD')!;

    expect(scorePlayerAppearance(defender, {
      playerId: defender.id,
      minutes: 90,
      goals: 1,
      cleanSheet: true,
      defensiveContributions: 10,
      bonus: 2,
    })).toBe(16);

    expect(scorePlayerAppearance(forward, {
      playerId: forward.id,
      minutes: 90,
      goals: 1,
      assists: 1,
      defensiveContributions: 12,
      yellowCards: 1,
    })).toBe(10);
  });

  test('captain, triple captain, and bench boost affect team scoring', () => {
    const pool = buildTournamentFantasyPlayerPool();
    const squad = autoPickSquad(pool, 'room-2');
    const team: FantasyTeam = {
      id: 'fantasy_team_1',
      managerId: 'peer_1',
      managerName: 'Dev',
      squad,
      freeTransfers: 1,
      chipsUsed: {},
      points: 0,
      updatedAt: Date.now(),
    };
    const appearances: PlayerAppearance[] = squad.playerIds.map((playerId) => ({
      playerId,
      minutes: 90,
      goals: playerId === squad.captainId ? 1 : 0,
    }));

    const normal = scoreFantasyTeam(team, pool, appearances);
    const triple = scoreFantasyTeam(team, pool, appearances, 'triple-captain');
    const bench = scoreFantasyTeam(team, pool, appearances, 'bench-boost');

    expect(triple).toBeGreaterThan(normal);
    expect(bench).toBeGreaterThanOrEqual(normal);
  });

  test('suggests and applies legal free transfers', () => {
    const pool = buildTournamentFantasyPlayerPool();
    const squad = autoPickSquad(pool, 'room-3', ['MEX']);
    const transfer = suggestTransfer(squad, pool, 'room-3-next', ['ENG'], 1);

    expect(transfer).not.toBeNull();
    const next = applyTransfer(squad, pool, transfer!);
    expect(validateFantasySquad(next, pool).valid).toBe(true);
    expect(next.playerIds).toContain(transfer!.inPlayerId);
    expect(next.playerIds).not.toContain(transfer!.outPlayerId);
    expect(transfer!.pointsHit).toBe(0);
  });

  test('rolls free transfers up to five and applies hits after free moves', () => {
    expect(nextFreeTransferCount(1, 0)).toBe(2);
    expect(nextFreeTransferCount(5, 0)).toBe(5);
    expect(nextFreeTransferCount(1, 2)).toBe(1);
    const pool = buildTournamentFantasyPlayerPool();
    const squad = autoPickSquad(pool, 'room-4');
    expect(suggestTransfer(squad, pool, 'room-4-next', ['BRA'], 0)?.pointsHit).toBe(4);
  });

  test('builds a round recap and locks after the deadline', () => {
    const pool = buildTournamentFantasyPlayerPool();
    const squad = autoPickSquad(pool, 'room-5');
    const team: FantasyTeam = {
      id: 'fantasy_team_1',
      managerId: 'peer_1',
      managerName: 'Dev',
      squad,
      freeTransfers: 1,
      chipsUsed: {},
      points: 0,
      updatedAt: Date.now(),
    };
    const appearances: PlayerAppearance[] = squad.playerIds.map((playerId) => ({
      playerId,
      minutes: 90,
      goals: playerId === squad.captainId ? 2 : 0,
    }));
    const recap = buildRoundRecap(team, pool, appearances);

    expect(recap.total).toBeGreaterThan(0);
    expect(recap.captainPoints).toBeGreaterThan(0);
    expect(recap.topPlayer?.playerId).toBe(squad.captainId ?? undefined);
    expect(isFantasyLocked(Date.parse('2026-06-12T00:00:00Z'), '2026-06-11T19:00:00Z')).toBe(true);
  });
});
