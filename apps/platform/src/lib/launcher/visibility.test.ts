import { describe, expect, it } from 'vitest';
import {
  buildLauncherVisibleSlugSet,
  filterCanonicalLauncherItems,
  launcherPhase,
  mergeCatalog,
  type LauncherRowShape,
} from './index';
import { curatedApps } from '$lib/container/state';

function row(overrides: Partial<LauncherRowShape>): LauncherRowShape {
  return {
    slug: 'maker-tool',
    name: 'Maker Tool',
    tagline: 'A public maker app',
    description: 'A public maker app',
    category: 'tools',
    themeColor: '#14120F',
    iconUrl: null,
    kind: 'local',
    firstPartySigned: false,
    upvoteCount: 0,
    installCount: 0,
    ...overrides,
  };
}

describe('launcher visibility helpers', () => {
  it('keeps canonical maker DB rows visible instead of limiting to first-party curation', () => {
    const catalog = mergeCatalog(curatedApps, [row({ slug: 'maker-ledger' })]);
    const visible = buildLauncherVisibleSlugSet(catalog, 'prelaunch');
    expect(visible.has('maker-ledger')).toBe(true);
  });

  it('drops alias-source rows while keeping their canonical successor', () => {
    const rows = [row({ slug: 'recipe' }), row({ slug: 'palate' })];
    const visible = buildLauncherVisibleSlugSet(mergeCatalog([], rows), 'prelaunch');
    const filtered = filterCanonicalLauncherItems(rows, visible).map((item) => item.slug);
    expect(filtered).toEqual(['palate']);
  });

  it('promotes Golazo in the current prelaunch slate and the World Cup phase', () => {
    const catalog = mergeCatalog(curatedApps, []);
    expect(buildLauncherVisibleSlugSet(catalog, 'prelaunch').has('golazo')).toBe(true);
    expect(buildLauncherVisibleSlugSet(catalog, 'world-cup').has('golazo')).toBe(true);
  });

  it('switches to world-cup phase on June 11, 2026 UTC', () => {
    expect(launcherPhase(new Date('2026-06-10T23:59:59.999Z'))).toBe('prelaunch');
    expect(launcherPhase(new Date('2026-06-11T00:00:00.000Z'))).toBe('world-cup');
  });

  it('hides a baked-public first-party app when the D1 override says private', () => {
    const withoutOverride = buildLauncherVisibleSlugSet(mergeCatalog(curatedApps, []), 'prelaunch');
    expect(withoutOverride.has('lift')).toBe(true);

    const overrides = new Map([['lift', { visibility: 'private', surface: 'featured' as const }]]);
    const withOverride = buildLauncherVisibleSlugSet(mergeCatalog(curatedApps, [], overrides), 'prelaunch');
    expect(withOverride.has('lift')).toBe(false);
  });

  it('shows a baked-private/archived app when the D1 override publishes it', () => {
    const withoutOverride = buildLauncherVisibleSlugSet(mergeCatalog(curatedApps, []), 'prelaunch');
    expect(withoutOverride.has('corporate-demo')).toBe(false);

    const overrides = new Map([['corporate-demo', { visibility: 'public', surface: 'featured' as const }]]);
    const withOverride = buildLauncherVisibleSlugSet(mergeCatalog(curatedApps, [], overrides), 'prelaunch');
    expect(withOverride.has('corporate-demo')).toBe(true);
  });

  it('applies overrides to DB rows as well as curated entries', () => {
    const rows = [row({ slug: 'docklands', firstPartySigned: true })];
    const overrides = new Map([['docklands', { visibility: 'public', surface: 'featured' as const }]]);
    const visible = buildLauncherVisibleSlugSet(mergeCatalog([], rows, overrides), 'prelaunch');
    expect(visible.has('docklands')).toBe(true);
  });
});
