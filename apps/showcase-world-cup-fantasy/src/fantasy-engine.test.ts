import { describe, expect, test } from 'bun:test';
import { PLAYER_BY_ID, PLAYERS, liveSnapshotAt, providerReadiness, scoreFantasyTeam, scorePlayer } from './fantasy-engine.ts';

describe('fantasy scoring engine', () => {
  test('recalculates player points from the latest source snapshot', () => {
    const mbappe = PLAYER_BY_ID.get('mbappe');
    if (!mbappe) throw new Error('missing Mbappe');

    const firstGoal = scorePlayer(mbappe, liveSnapshotAt(1));
    const fullTime = scorePlayer(mbappe, liveSnapshotAt(3));

    expect(firstGoal.points).toBe(6);
    expect(firstGoal.reasons).toContain('1 goal +4');
    expect(fullTime.points).toBe(10);
    expect(fullTime.reasons).toContain('player of match +3');
  });

  test('removes provisional clean-sheet points when the next snapshot corrects the state', () => {
    const maignan = PLAYER_BY_ID.get('maignan');
    if (!maignan) throw new Error('missing Maignan');

    expect(scorePlayer(maignan, liveSnapshotAt(1)).points).toBe(6);
    expect(scorePlayer(maignan, liveSnapshotAt(2)).points).toBe(3);
  });

  test('applies captain and triple-captain multipliers on top of base points', () => {
    const mbappe = PLAYER_BY_ID.get('mbappe');
    if (!mbappe) throw new Error('missing Mbappe');

    const normal = scoreFantasyTeam([mbappe], 'mbappe', 'none', liveSnapshotAt(3));
    const triple = scoreFantasyTeam([mbappe], 'mbappe', 'triple-captain', liveSnapshotAt(3));

    expect(normal.total).toBe(20);
    expect(normal.captainBonus).toBe(10);
    expect(triple.total).toBe(30);
    expect(triple.captainBonus).toBe(20);
  });

  test('keeps provider mapping visible as a launch gate', () => {
    expect(providerReadiness(PLAYERS)[0]).toMatchObject({
      label: 'Provider IDs',
      value: `${PLAYERS.length}/${PLAYERS.length}`,
    });
  });
});
