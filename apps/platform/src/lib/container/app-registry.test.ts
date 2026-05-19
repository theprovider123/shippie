import { describe, expect, test } from 'vitest';
import { findRequestedApp, visibleContainerApps } from './app-registry';
import { curatedApps } from './state';

describe('findRequestedApp', () => {
  test('resolves public runtime aliases to curated container slugs', () => {
    const app = findRequestedApp(curatedApps, 'recipe');
    expect(app?.slug).toBe('palate');
    expect(app?.standaloneUrl).toBe('/run/palate');
  });

  test('resolves legacy recipe-saver requests to the consolidated food app', () => {
    const app = findRequestedApp(curatedApps, 'recipe-saver');
    expect(app?.slug).toBe('palate');
  });

  test('keeps retired mode slugs resolvable through their consolidated homes', () => {
    expect(findRequestedApp(curatedApps, 'sudoku')?.slug).toBe('daily-puzzle');
    expect(findRequestedApp(curatedApps, 'live-room')?.slug).toBe('match-room');
    expect(findRequestedApp(curatedApps, 'would-you-rather')?.slug).toBe('drawing-telephone');
  });
});

describe('visibleContainerApps', () => {
  test('hides archived apps from launcher surfaces without deleting them from the registry', () => {
    const visible = visibleContainerApps(curatedApps);
    const visibleSlugs = new Set(visible.map((app) => app.slug));
    const allSlugs = new Set(curatedApps.map((app) => app.slug));

    expect(allSlugs.has('sudoku')).toBe(true);
    expect(allSlugs.has('live-room')).toBe(true);
    expect(visibleSlugs.has('sudoku')).toBe(false);
    expect(visibleSlugs.has('live-room')).toBe(false);
    expect(visibleSlugs.has('daily-puzzle')).toBe(true);
    expect(visibleSlugs.has('match-room')).toBe(true);
  });

  test('keeps imported apps visible when they do not declare a launch surface', () => {
    const [app] = visibleContainerApps([{ ...curatedApps[0], surface: undefined }]);
    expect(app?.id).toBe(curatedApps[0].id);
  });
});
