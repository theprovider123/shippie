/**
 * Running-tools invariants — the "shows as Running" contract.
 *
 *   1. Every resolvable open id stays in the running set, even when the
 *      launch-visible catalog (curation/phase filtering) hides the app.
 *   2. Truly-unresolvable ids are reported (the page reconciles them out
 *      of openAppIds) — never silently dropped while staying mounted.
 *   3. Alias slugs canonicalise for isRunning comparisons.
 *   4. Composed with focusApp (the single registration path): open A
 *      then switch to B keeps BOTH running; LRU eviction drops the
 *      evicted app honestly and never the active (head) app.
 */
import { describe, expect, it } from 'vitest';
import { buildRailGroups, type RailTool } from './rail-groups';
import { focusApp, MOBILE_MAX_MOUNTED } from './iframe-lifecycle';
import {
  appToRailTool,
  mergeRailCatalog,
  resolveRunningApps,
  runningSlugSet,
} from './running-tools';
import { localPermissions, type ContainerApp } from './state';

const app = (id: string, slug: string = id, extra: Partial<ContainerApp> = {}): ContainerApp => ({
  id,
  slug,
  name: slug[0]!.toUpperCase() + slug.slice(1),
  shortName: slug.slice(0, 6),
  description: `${slug} fixture`,
  appKind: 'local',
  entry: '/index.html',
  labelKind: 'Local',
  icon: slug.slice(0, 2).toUpperCase(),
  accent: '#E8603C',
  version: '1.0.0',
  packageHash: `hash_${id}`,
  standaloneUrl: `/run/${slug}`,
  permissions: localPermissions(slug),
  ...extra,
});

const lookup = (...apps: ContainerApp[]) => new Map(apps.map((a) => [a.id, a]));

describe('resolveRunningApps', () => {
  it('resolves open ids in order against the full lookup and dedupes', () => {
    const a = app('id-a', 'palate');
    const b = app('id-b', 'golazo');
    const out = resolveRunningApps(['id-b', 'id-a', 'id-b'], lookup(a, b));
    expect(out.apps.map((x) => x.id)).toEqual(['id-b', 'id-a']);
    expect(out.unresolvedIds).toEqual([]);
  });

  it('reports ids that resolve to no installed app instead of dropping them silently', () => {
    const a = app('id-a', 'palate');
    const out = resolveRunningApps(['id-a', 'id-ghost'], lookup(a));
    expect(out.apps.map((x) => x.id)).toEqual(['id-a']);
    expect(out.unresolvedIds).toEqual(['id-ghost']);
  });

  it('reconciliation: filtering unresolved ids out of openAppIds yields a clean resolution', () => {
    const a = app('id-a', 'palate');
    const first = resolveRunningApps(['id-ghost', 'id-a'], lookup(a));
    const reconciled = ['id-ghost', 'id-a'].filter((id) => !first.unresolvedIds.includes(id));
    const second = resolveRunningApps(reconciled, lookup(a));
    expect(second.unresolvedIds).toEqual([]);
    expect(second.apps.map((x) => x.slug)).toEqual(['palate']);
  });
});

describe('runningSlugSet', () => {
  it('contains raw and canonical slugs for alias-mounted apps', () => {
    // 'recipe' is a SLUG_ALIASES source whose canonical home is 'palate'.
    const legacy = app('id-legacy', 'recipe');
    const slugs = runningSlugSet([legacy]);
    expect(slugs.has('recipe')).toBe(true);
    expect(slugs.has('palate')).toBe(true);
  });

  it('keeps canonical slugs as themselves', () => {
    const slugs = runningSlugSet([app('id-a', 'golazo')]);
    expect(slugs.has('golazo')).toBe(true);
    expect(slugs.size).toBe(1);
  });
});

describe('appToRailTool', () => {
  it('maps app fields with themeColor and category-colour fallbacks', () => {
    const themed = appToRailTool(app('id-a', 'palate', { themeColor: '#123456', category: 'food-drink' }));
    expect(themed).toMatchObject({ slug: 'palate', accent: '#123456', themeColor: '#123456' });

    const unthemed = appToRailTool(app('id-b', 'lift', { themeColor: null, category: 'fitness' }));
    expect(unthemed.accent).toBe(unthemed.themeColor);
    expect(unthemed.accent).toContain('var(');
    expect(unthemed.icon).toBe('LI');
  });
});

describe('mergeRailCatalog', () => {
  const tool = (slug: string): RailTool => ({ slug, name: slug, icon: 'XX', accent: '#fff' });

  it('appends running tools the catalog does not know, preserving catalog order', () => {
    const merged = mergeRailCatalog([tool('palate'), tool('lift')], [tool('imported-app'), tool('palate')]);
    expect(merged.map((t) => t.slug)).toEqual(['palate', 'lift', 'imported-app']);
  });

  it('returns the catalog as-is when running tools are all known', () => {
    const merged = mergeRailCatalog([tool('palate')], [tool('palate')]);
    expect(merged.map((t) => t.slug)).toEqual(['palate']);
  });
});

describe('multitasking contract — registration + resolution composed', () => {
  it('open A then switch to B keeps both running', () => {
    const a = app('id-a', 'palate');
    const b = app('id-b', 'golazo');
    // Boot via URL registers A exactly like openApp() (LRU head).
    let openAppIds = [...focusApp([], a.id).openAppIds];
    // Switcher-sheet selection goes through the same helper.
    openAppIds = [...focusApp(openAppIds, b.id).openAppIds];
    const running = resolveRunningApps(openAppIds, lookup(a, b));
    expect(running.apps.map((x) => x.slug)).toEqual(['golazo', 'palate']);
  });

  it('a mounted app hidden from the launch-visible catalog still shows in the Open group', () => {
    const visible = app('id-vis', 'golazo');
    const hidden = app('id-hidden', 'imported-thing'); // curation-filtered / imported
    const running = resolveRunningApps(['id-hidden', 'id-vis'], lookup(visible, hidden));
    const runningTools = running.apps.map(appToRailTool);
    const catalog = [appToRailTool(visible)]; // launch slate doesn't list `hidden`
    const groups = buildRailGroups({
      catalog: mergeRailCatalog(catalog, runningTools),
      openSlugs: runningTools.map((t) => t.slug),
      saved: [],
      recents: [],
    });
    expect(groups.open.map((t) => t.slug)).toEqual(['imported-thing', 'golazo']);
  });

  it('LRU eviction drops the evicted app from Running honestly and never evicts the new head', () => {
    const apps = ['a', 'b', 'c', 'd'].map((s) => app(`id-${s}`, s));
    const byId = lookup(...apps);
    let openAppIds: readonly string[] = ['id-a', 'id-b', 'id-c']; // at the mobile cap
    const decision = focusApp(openAppIds, 'id-d', MOBILE_MAX_MOUNTED);
    openAppIds = decision.openAppIds;
    expect(decision.evicted).toBe('id-c');
    expect(openAppIds[0]).toBe('id-d'); // active stays at the head, never evicted
    const running = resolveRunningApps(openAppIds, byId);
    expect(running.apps.map((x) => x.slug)).toEqual(['d', 'a', 'b']);
    expect(running.apps.some((x) => x.slug === 'c')).toBe(false);
  });

  it('re-opening an already-running app dedupes instead of double-mounting', () => {
    const a = app('id-a', 'palate');
    const b = app('id-b', 'golazo');
    let openAppIds: readonly string[] = ['id-a', 'id-b'];
    openAppIds = focusApp(openAppIds, 'id-b').openAppIds;
    const running = resolveRunningApps(openAppIds, lookup(a, b));
    expect(running.apps.map((x) => x.id)).toEqual(['id-b', 'id-a']);
  });
});
