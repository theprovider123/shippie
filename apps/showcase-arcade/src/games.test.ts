import { describe, expect, test } from 'bun:test';
import {
  ARCADE_GAMES,
  childRuntimeSrc,
  gamesForLane,
  neighborGameId,
  normalizeGameId,
} from './games';

describe('arcade game registry', () => {
  test('contains unique game ids', () => {
    const ids = ARCADE_GAMES.map((game) => game.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('groups every game into a visible lane', () => {
    const laneTotal =
      gamesForLane('daily').length +
      gamesForLane('cabinet').length +
      gamesForLane('room').length +
      gamesForLane('strategy').length;
    expect(laneTotal).toBe(ARCADE_GAMES.length);
  });

  test('normalizes unknown game ids to the default cabinet game', () => {
    expect(normalizeGameId('snake')).toBe('snake');
    expect(normalizeGameId('missing')).toBe('snake');
    expect(normalizeGameId(null)).toBe('snake');
  });

  test('wraps game neighbors', () => {
    expect(neighborGameId(ARCADE_GAMES[0]!.id, -1)).toBe(ARCADE_GAMES.at(-1)!.id);
    expect(neighborGameId(ARCADE_GAMES.at(-1)!.id, 1)).toBe(ARCADE_GAMES[0]!.id);
  });

  test('builds same-origin child runtime paths and forwards safe params', () => {
    expect(childRuntimeSrc('snake', '?game=bricks&foo=bar&shippie_embed=0')).toBe(
      '/__shippie-run/snake/?foo=bar&shippie_embed=1&arcade_shell=1',
    );
  });
});
