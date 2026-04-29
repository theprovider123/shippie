/**
 * P1A.2 — `agent.insights` source-data invariant.
 *
 * The handler is a pure delegate to `ctx.insightsForApp`. The
 * scoping logic itself lives in `+page.svelte`'s
 * `insightsForCaller` (and is duplicated here for unit-level
 * coverage). The invariant from the design pass:
 *
 *   Install three apps A, B, C. A has no intent overlap with B/C.
 *   Run the agent. A calls `agent.insights()`. The result must
 *   contain zero insights derived from B or C data, even if those
 *   insights are tagged with A's slug.
 *
 * Cross-app correlations leak data unless the caller had read
 * access to every namespace in the insight's `provenance`.
 */
import { describe, expect, test, vi } from 'vitest';
import { createAppHandlers, type AppHandlerContext } from './bridge-handlers';
import { localPermissions, type ContainerApp } from './state';
import { grantIntent, isIntentGranted, type IntentGrants } from './intent-registry';
import type { Insight } from '@shippie/agent';

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
  insightsForApp: AppHandlerContext['insightsForApp'],
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
    listOverlappingApps: () => [],
    insightsForApp,
  };
  return createAppHandlers(ctx);
}

const dummyRequest = {
  capability: 'agent.insights' as const,
  method: 'list',
  request: {
    protocol: 'shippie.bridge.v1' as const,
    id: '1',
    appId: 'app_x',
    capability: 'agent.insights' as const,
    method: 'list',
    payload: {},
  },
};

describe('agent.insights — handler delegates to insightsForApp', () => {
  test('returns the insights the host scoped to', async () => {
    const caller = makeApp('habit-tracker', { consumes: ['cooked-meal'] });
    const insight: Insight = {
      id: 'i1',
      strategy: 'meal-planning',
      urgency: 'low',
      title: 'Plan a meal',
      body: '',
      target: { app: 'habit-tracker' },
      generatedAt: 0,
      provenance: ['habit-tracker'],
    };
    const insightsForApp = vi.fn(() => [insight]);
    const handlers = buildHandlers(caller, insightsForApp);
    const result = (await handlers['agent.insights']!({ payload: {}, ...dummyRequest })) as {
      insights: readonly Insight[];
    };
    expect(insightsForApp).toHaveBeenCalledWith(caller.id);
    expect(result.insights).toHaveLength(1);
  });
});

/**
 * The scoping function lives in +page.svelte; the logic is duplicated
 * here so the invariants get vitest coverage independently of the
 * Svelte component lifecycle. Any change to one needs the same change
 * in the other.
 */
function insightsForCaller(
  callerApp: ContainerApp,
  installed: readonly ContainerApp[],
  grants: IntentGrants,
  insights: readonly Insight[],
): readonly Insight[] {
  const callerConsumes = new Set<string>(
    callerApp.permissions.capabilities.crossAppIntents?.consumes ?? [],
  );
  const readableSlugs = new Set<string>([callerApp.slug]);
  if (callerConsumes.size > 0) {
    for (const app of installed) {
      if (app.id === callerApp.id) continue;
      const provides = app.permissions.capabilities.crossAppIntents?.provides ?? [];
      for (const intent of provides) {
        if (!callerConsumes.has(intent)) continue;
        if (!isIntentGranted(grants, callerApp.id, intent)) continue;
        readableSlugs.add(app.slug);
        break;
      }
    }
  }
  return insights.filter((insight) => {
    if (insight.provenance.length === 0) return true;
    for (const slug of insight.provenance) {
      if (!readableSlugs.has(slug)) return false;
    }
    return true;
  });
}

describe('insightsForCaller — source-data invariant', () => {
  test('caller sees insights derived only from its own namespace', () => {
    const a = makeApp('a');
    const b = makeApp('b');
    const c = makeApp('c');
    const ownInsight: Insight = {
      id: 'a1',
      strategy: 'schedule-awareness',
      urgency: 'low',
      title: 'A insight',
      body: '',
      target: { app: 'a' },
      generatedAt: 0,
      provenance: ['a'],
    };
    expect(insightsForCaller(a, [a, b, c], {}, [ownInsight])).toEqual([ownInsight]);
  });

  test('caller does NOT see cross-app insight when it has no grant on the other app', () => {
    // The acceptance criterion: A has no intent overlap with B/C.
    // The agent produced an insight derived from B's rows but
    // targeted at A. A must not see it — `target.app === 'a'` is not
    // enough; provenance must be readable.
    const a = makeApp('a');
    const b = makeApp('b');
    const c = makeApp('c');
    const cross: Insight = {
      id: 'cross1',
      strategy: 'meal-planning',
      urgency: 'low',
      title: 'Plan from B',
      body: '',
      target: { app: 'a' }, // tagged at A
      generatedAt: 0,
      provenance: ['b', 'a'], // but derived from B's data
    };
    expect(insightsForCaller(a, [a, b, c], {}, [cross])).toEqual([]);
  });

  test('caller sees cross-app insight when the granted intent makes the other slug readable', () => {
    const a = makeApp('a', { consumes: ['cooked-meal'] });
    const b = makeApp('b', { provides: ['cooked-meal'] });
    const c = makeApp('c');
    const cross: Insight = {
      id: 'cross1',
      strategy: 'meal-planning',
      urgency: 'low',
      title: 'Plan from B',
      body: '',
      target: { app: 'a' },
      generatedAt: 0,
      provenance: ['b', 'a'],
    };
    const grants = grantIntent({}, a.id, 'cooked-meal');
    expect(insightsForCaller(a, [a, b, c], grants, [cross])).toEqual([cross]);
  });

  test('grant on B does not leak insights derived from C', () => {
    const a = makeApp('a', { consumes: ['cooked-meal'] });
    const b = makeApp('b', { provides: ['cooked-meal'] });
    const c = makeApp('c', { provides: ['workout-completed'] });
    // Insight needs both B and C — caller only granted B's intent.
    const cross: Insight = {
      id: 'cross-bc',
      strategy: 'cross',
      urgency: 'low',
      title: 'B + C says X',
      body: '',
      target: { app: 'a' },
      generatedAt: 0,
      provenance: ['b', 'c', 'a'],
    };
    const grants = grantIntent({}, a.id, 'cooked-meal');
    expect(insightsForCaller(a, [a, b, c], grants, [cross])).toEqual([]);
  });

  test('system insight with empty provenance is visible to every caller', () => {
    const a = makeApp('a');
    const sys: Insight = {
      id: 'sys',
      strategy: 'system',
      urgency: 'low',
      title: 'Welcome',
      body: '',
      target: { app: 'a' },
      generatedAt: 0,
      provenance: [],
    };
    expect(insightsForCaller(a, [a], {}, [sys])).toEqual([sys]);
  });
});
