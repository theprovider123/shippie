import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  ARCADE_GAMES,
  childRuntimeSrc,
  gamesForLane,
  neighborGameId,
  normalizeGameId,
} from './games';

describe('arcade game registry', () => {
  test('every surface=arcade showcase is in the cabinet (auto-coverage)', () => {
    // "Add any game automatically": a new game app only needs
    // curation.surface 'arcade' in its shippie.json — this test fails the
    // build until it gets a cabinet entry here, so games can't be forgotten.
    const appsDir = resolve(import.meta.dir, '../..');
    const cabinetIds = new Set(ARCADE_GAMES.map((game) => game.id));
    const missing: string[] = [];
    for (const entry of readdirSync(appsDir)) {
      if (!entry.startsWith('showcase-') || entry === 'showcase-arcade') continue;
      const manifestPath = join(appsDir, entry, 'shippie.json');
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        slug?: string;
        curation?: { surface?: string };
      };
      if (manifest.curation?.surface !== 'arcade') continue;
      const slug = manifest.slug ?? entry.replace(/^showcase-/, '');
      if (!cabinetIds.has(slug)) missing.push(slug);
    }
    expect(missing, `surface=arcade games missing from ARCADE_GAMES: ${missing.join(', ')}`).toEqual([]);
  });

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
