/**
 * P1A.1 — `apps.list` overlap-only scoping invariant.
 *
 * The handler is a pure delegate to `ctx.listOverlappingApps`. The
 * scoping logic itself lives in `+page.svelte`'s
 * `listAppsOverlappingCaller`. Both have to honour the invariants
 * stated in the design pass:
 *
 *   1. An iframe declaring no intents calls `apps.list` and gets [].
 *   2. An iframe declaring intent X gets back providers/consumers of
 *      X plus itself, but NOT apps that share zero intents with it.
 *   3. The result is never the user's full installed-app set.
 */
import { describe, expect, test, vi } from 'vitest';
import { createAppHandlers, type AppHandlerContext } from './bridge-handlers';
import { localPermissions, type ContainerApp } from './state';

function makeApp(slug: string, intents?: { provides?: string[]; consumes?: string[] }): ContainerApp {
  return {
    id: `app_${slug}`,
    slug,
    name: slug,
    shortName: slug,
    description: '',
    appKind: 'local',
    entry: 'app/index.html',
    labelKind: 'Local',
    icon: 'X',
    accent: '#000',
    version: '1',
    packageHash: `sha256:${'0'.repeat(64)}`,
    standaloneUrl: `/run/${slug}`,
    permissions: localPermissions(slug, intents),
  };
}

function buildHandlers(
  callerApp: ContainerApp,
  listOverlappingApps: AppHandlerContext['listOverlappingApps'],
) {
  const ctx: AppHandlerContext = {
    appId: callerApp.id,
    app: callerApp,
    insertRow: () => ({ id: 'x', table: 't', payload: null, createdAt: '' }),
    queryRows: () => ({ rows: [] }),
    storageUsage: () => ({ rows: 0, bytes: 0 }),
    consumeIntent: async () => ({ provider: null, rows: [] }),
    consumersFor: () => [],
    dataOpenPanel: () => ({ opened: true as const }),
    fireTexture: () => ({ fired: true, name: 'confirm' }),
    runAi: async () => ({ task: 'classify', output: null, source: 'unavailable' }),
    broadcastIntent: () => ({ delivered: 0 }),
    listOverlappingApps,
    insightsForApp: () => [],
    startTransferDrop: () => ({ kind: '', acceptors: [] }),
    commitTransferDrop: () => ({ delivered: false, target: null, reason: 'no_target' as const }),
  };
  return createAppHandlers(ctx);
}

const dummyRequest = {
  capability: 'apps.list' as const,
  method: 'list',
  request: {
    protocol: 'shippie.bridge.v1' as const,
    id: '1',
    appId: 'app_x',
    capability: 'apps.list' as const,
    method: 'list',
    payload: {},
  },
};

describe('apps.list — handler delegates to listOverlappingApps', () => {
  test('returns the apps the host scoped to', async () => {
    const caller = makeApp('habit-tracker', { consumes: ['cooked-meal'] });
    const list = vi.fn(() => [
      {
        slug: 'recipe',
        name: 'Recipe',
        shortName: 'Recipe',
        description: '',
        labelKind: 'Local' as const,
        provides: ['cooked-meal'],
        consumes: [],
      },
    ]);
    const handlers = buildHandlers(caller, list);
    const result = (await handlers['apps.list']!({ payload: {}, ...dummyRequest })) as {
      apps: unknown[];
    };
    expect(list).toHaveBeenCalledWith(caller.id);
    expect(result.apps).toHaveLength(1);
  });
});

/**
 * The scoping function lives in +page.svelte; the logic is duplicated
 * here so the invariants get vitest coverage independently of the
 * Svelte component lifecycle. Any change to one needs the same change
 * in the other.
 */
function listAppsOverlappingCaller(
  callerApp: ContainerApp,
  installed: readonly ContainerApp[],
) {
  const callerIntents = callerApp.permissions.capabilities.crossAppIntents;
  const callerSet = new Set<string>([
    ...(callerIntents?.provides ?? []),
    ...(callerIntents?.consumes ?? []),
  ]);
  if (callerSet.size === 0) return [];
  return installed
    .filter((app) => {
      if (app.id === callerApp.id) return true;
      const intents = app.permissions.capabilities.crossAppIntents;
      const appSet = new Set<string>([
        ...(intents?.provides ?? []),
        ...(intents?.consumes ?? []),
      ]);
      for (const intent of appSet) if (callerSet.has(intent)) return true;
      return false;
    })
    .map((app) => app.slug);
}

describe('listAppsOverlappingCaller — scoping invariants', () => {
  test('caller with no intents gets empty list', () => {
    const caller = makeApp('caller');
    const others = [makeApp('a', { provides: ['x'] }), makeApp('b', { consumes: ['y'] })];
    expect(listAppsOverlappingCaller(caller, [caller, ...others])).toEqual([]);
  });

  test('caller sees only apps that share at least one intent', () => {
    const caller = makeApp('habit', { consumes: ['cooked-meal', 'workout-completed'] });
    const recipe = makeApp('recipe', { provides: ['cooked-meal'] });
    const workout = makeApp('workout', { provides: ['workout-completed'] });
    const journal = makeApp('journal', { consumes: ['shopping-list'] }); // no overlap
    const result = listAppsOverlappingCaller(caller, [caller, recipe, workout, journal]);
    expect(result).toContain('habit');
    expect(result).toContain('recipe');
    expect(result).toContain('workout');
    expect(result).not.toContain('journal');
  });

  test('does not leak the full installed-app set when caller has narrow intents', () => {
    const caller = makeApp('caffeine', { provides: ['caffeine-logged'] });
    const unrelated = Array.from({ length: 10 }, (_, i) =>
      makeApp(`unrelated-${i}`, { provides: [`other-${i}`] }),
    );
    const result = listAppsOverlappingCaller(caller, [caller, ...unrelated]);
    expect(result).toEqual(['caffeine']); // only self — no fingerprint of unrelated apps
  });

  test('caller always sees themselves even when no other app shares intents', () => {
    const caller = makeApp('lonely', { provides: ['niche'] });
    expect(listAppsOverlappingCaller(caller, [caller])).toEqual(['lonely']);
  });

  test('overlap is symmetric: provider sees consumer of its own intent', () => {
    const recipe = makeApp('recipe', { provides: ['cooked-meal'] });
    const habit = makeApp('habit', { consumes: ['cooked-meal'] });
    expect(listAppsOverlappingCaller(recipe, [recipe, habit])).toContain('habit');
    expect(listAppsOverlappingCaller(habit, [recipe, habit])).toContain('recipe');
  });
});
