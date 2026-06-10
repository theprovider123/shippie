/**
 * Convergence regression test.
 *
 * The split-brain bug we're closing: homepage and drawer historically
 * read different sources, applied different hide rules, and could
 * display different app sets. Specifically, golazo was hidden on the
 * homepage by `PRELAUNCH_HIDDEN_SLUGS` but visible in the drawer.
 *
 * Now both surfaces are required to consume `buildToolShelf()` with
 * the same inputs (catalog + phase + promotions). The visibleSlugs
 * field is a sorted canonical-slug list; both surfaces must produce
 * the same array when given the same catalog.
 *
 * This test asserts the contract by running the shelf builder twice
 * with the same inputs and proving the visible sets match. It also
 * locks in that PRELAUNCH_HIDDEN_SLUGS is no longer a homepage-only
 * concept: Golazo is phase-promoted into both surfaces together.
 */
import { describe, expect, it } from 'vitest';
import {
  LAUNCHER_PROMOTIONS_BY_PHASE,
  containerAppToToolEntry,
  mergeCatalog,
  buildToolShelf,
} from './index';
import { curatedApps } from '$lib/container/state';
import { visibleContainerApps } from '$lib/container/app-registry';

function homepageShelf(opts?: {
  phase?: 'prelaunch' | 'world-cup';
  promote?: readonly string[];
  pinned?: readonly string[];
}) {
  const phase = opts?.phase ?? 'prelaunch';
  const catalog = mergeCatalog(curatedApps, []);
  return buildToolShelf({
    catalog,
    phase,
    promotions: opts?.promote ? { promote: opts.promote } : LAUNCHER_PROMOTIONS_BY_PHASE[phase],
    pinnedSlugs: opts?.pinned ?? [],
  });
}

function drawerShelf(opts?: {
  phase?: 'prelaunch' | 'world-cup';
  promote?: readonly string[];
  pinned?: readonly string[];
  activeSlug?: string;
  liveSlugs?: readonly string[];
}) {
  const phase = opts?.phase ?? 'prelaunch';
  const catalog = visibleContainerApps(curatedApps).map((app) => containerAppToToolEntry(app));
  return buildToolShelf({
    catalog,
    phase,
    promotions: opts?.promote ? { promote: opts.promote } : LAUNCHER_PROMOTIONS_BY_PHASE[phase],
    pinnedSlugs: opts?.pinned ?? [],
    activeSlug: opts?.activeSlug,
    liveSlugs: opts?.liveSlugs,
  });
}

describe('homepage ⇔ drawer convergence', () => {
  it('renders the same visible set at prelaunch with no user state', () => {
    const home = homepageShelf();
    const drawer = drawerShelf();
    expect(home.visibleSlugs).toEqual(drawer.visibleSlugs);
  });

  it('renders the same visible set during world-cup with golazo promoted', () => {
    const home = homepageShelf({ phase: 'world-cup', promote: ['golazo'] });
    const drawer = drawerShelf({ phase: 'world-cup', promote: ['golazo'] });
    expect(home.visibleSlugs).toEqual(drawer.visibleSlugs);
    expect(home.visibleSlugs).toContain('golazo');
    expect(drawer.visibleSlugs).toContain('golazo');
  });

  it('shows golazo on BOTH surfaces during prelaunch', () => {
    const home = homepageShelf({ phase: 'prelaunch' });
    const drawer = drawerShelf({ phase: 'prelaunch' });
    expect(home.visibleSlugs).toContain('golazo');
    expect(drawer.visibleSlugs).toContain('golazo');
  });

  it('hides aliased slugs on BOTH surfaces (recipe, cooking, sip-log…)', () => {
    const home = homepageShelf();
    const drawer = drawerShelf();
    for (const aliased of ['recipe', 'cooking', 'sip-log', 'live-room', 'show-and-tell']) {
      expect(home.visibleSlugs).not.toContain(aliased);
      expect(drawer.visibleSlugs).not.toContain(aliased);
    }
  });

  it('promotes the canonical successor when the user pinned an alias', () => {
    // User saved `recipe` before the alias landed. It should resolve
    // to `palate` in Quick instead of being silently dropped.
    const drawer = drawerShelf({ pinned: ['recipe'] });
    const quick = drawer.sections.find((s) => s.id === 'quick');
    expect(quick).toBeDefined();
    expect(quick!.tools.map((t) => t.slug)).toContain('palate');
  });

  it('drawer Quick can carry activeSlug + live, homepage cannot (runtime distinction)', () => {
    const home = homepageShelf({ pinned: ['sleep'] });
    const drawer = drawerShelf({
      pinned: ['sleep'],
      activeSlug: 'tab',
      liveSlugs: ['ledger'],
    });
    // Homepage Quick: pinned only
    const homeQuick = home.sections.find((s) => s.id === 'quick');
    expect(homeQuick!.tools.map((t) => t.slug)).toEqual(['sleep']);
    // Drawer Quick: active first, then live, then pinned
    const drawerQuick = drawer.sections.find((s) => s.id === 'quick');
    expect(drawerQuick!.tools.slice(0, 3).map((t) => t.slug)).toEqual([
      'tab',
      'ledger',
      'sleep',
    ]);
    // But visible sets must still match.
    expect(home.visibleSlugs).toEqual(drawer.visibleSlugs);
  });
});
