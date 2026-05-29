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

  it('keeps upcoming tools hidden until the launch phase promotes them', () => {
    const catalog = mergeCatalog(curatedApps, []);
    expect(buildLauncherVisibleSlugSet(catalog, 'prelaunch').has('golazo')).toBe(false);
    expect(buildLauncherVisibleSlugSet(catalog, 'world-cup').has('golazo')).toBe(true);
  });

  it('switches to world-cup phase on June 11, 2026 UTC', () => {
    expect(launcherPhase(new Date('2026-06-10T23:59:59.999Z'))).toBe('prelaunch');
    expect(launcherPhase(new Date('2026-06-11T00:00:00.000Z'))).toBe('world-cup');
  });
});
