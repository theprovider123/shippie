/**
 * C2 — cross-cluster intent acceptance test.
 *
 * The plan's load-bearing acceptance criterion:
 *
 *   "Recipe Saver provides `cooked-meal` event → Habit Tracker (different
 *    cluster) auto-checks `cooked-dinner` habit. This proves the
 *    ecosystem compounds beyond individual clusters."
 *
 * This test wires the contract → registry → handlers stack end-to-end
 * with two stub container apps and verifies the consumer receives the
 * provider's row when the user has granted the intent. No real iframes
 * required — we drive the registry + bridge handlers directly so the
 * test runs fast and stays deterministic.
 */
import { describe, expect, test } from 'vitest';
import {
  createIntentRegistry,
  grantIntent,
  isIntentGranted,
} from './intent-registry';
import {
  createAppHandlers,
  filterRowsByTable,
  type AppHandlerContext,
  type IntentRequestResult,
} from './bridge-handlers';
import { localPermissions, type ContainerApp, type LocalRow } from './state';
import {
  crossClusterAcceptancePair,
  showcaseCatalog,
} from '@shippie/templates';

function makeApp(slug: string, opts: Partial<ContainerApp>): ContainerApp {
  return {
    id: `app_${slug}`,
    slug,
    name: opts.name ?? slug,
    shortName: opts.shortName ?? slug,
    description: '',
    appKind: 'local',
    entry: 'app/index.html',
    labelKind: 'Local',
    icon: 'X',
    accent: '#000',
    version: '1',
    packageHash: `sha256:${'0'.repeat(64)}`,
    standaloneUrl: `/apps/${slug}`,
    permissions: opts.permissions ?? localPermissions(slug),
  };
}

describe('Cross-cluster intent acceptance — Recipe Saver → Habit Tracker', () => {
  const { provider, consumer, intent } = crossClusterAcceptancePair;

  test('the catalogue declares the cross-cluster pair on opposite clusters', () => {
    const providerEntry = showcaseCatalog.find((a) => a.id === provider);
    const consumerEntry = showcaseCatalog.find((a) => a.id === consumer);
    expect(providerEntry?.cluster).toBe('food');
    expect(consumerEntry?.cluster).toBe('health');
    expect(providerEntry?.intents?.provides).toContain(intent);
    expect(consumerEntry?.intents?.consumes).toContain(intent);
  });

  test('the provider can broadcast and the consumer receives matching rows', async () => {
    const recipeSaver = makeApp(provider, {
      name: 'Recipe Saver',
      permissions: localPermissions(provider, { provides: [intent] }),
    });
    const habitTracker = makeApp(consumer, {
      name: 'Habit Tracker',
      permissions: localPermissions(consumer, { consumes: [intent] }),
    });
    const apps: ContainerApp[] = [recipeSaver, habitTracker];

    const registry = createIntentRegistry();
    registry.refresh(apps);

    const cookedMealRow: LocalRow = {
      id: 'r1',
      table: intent,
      payload: { dish: 'Carbonara' },
      createdAt: new Date().toISOString(),
    };
    const rowsByApp: Record<string, LocalRow[]> = {
      [recipeSaver.id]: [cookedMealRow],
      [habitTracker.id]: [],
    };

    let grants = grantIntent({}, habitTracker.id, intent);

    const consumeIntent = async (
      consumerAppId: string,
      requestedIntent: string,
    ): Promise<IntentRequestResult> => {
      const providers = registry.providersFor(requestedIntent);
      if (providers.length === 0) {
        return { provider: null, rows: [], reason: 'no_provider' };
      }
      const p = providers[0]!;
      if (!isIntentGranted(grants, consumerAppId, requestedIntent)) {
        return { provider: null, rows: [], reason: 'permission_not_yet_granted' };
      }
      const rows = filterRowsByTable(rowsByApp[p.appId] ?? [], { table: requestedIntent });
      return {
        provider: { appId: p.appId, appSlug: p.appSlug, appName: p.appName },
        rows,
      };
    };

    const ctx: AppHandlerContext = {
      appId: habitTracker.id,
      app: habitTracker,
      insertRow: () => ({ id: 'x', table: 't', payload: null, createdAt: '' }),
      queryRows: () => ({ rows: [] }),
      storageUsage: () => ({ rows: 0, bytes: 0 }),
      consumeIntent,
      consumersFor: (intentName) => registry.consumersFor(intentName),
      dataOpenPanel: () => ({ opened: true as const }),
      fireTexture: () => ({ fired: true, name: 'confirm' }),
      runAi: async () => ({ task: 'classify', output: null, source: 'unavailable' }),
      broadcastIntent: () => ({ delivered: 0 }),
      listOverlappingApps: () => [],
      insightsForApp: () => [],
    };
    const handlers = createAppHandlers(ctx);

    const result = (await handlers['intent.consume']!({
      payload: { intent },
      capability: 'intent.consume',
      method: 'consume',
      request: { protocol: 'shippie.bridge.v1', id: '1', appId: habitTracker.id, capability: 'intent.consume', method: 'consume', payload: { intent } },
    })) as IntentRequestResult;

    expect(result.provider?.appSlug).toBe(provider);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.payload).toEqual({ dish: 'Carbonara' });

    // And without a grant, the consumer gets no rows back.
    grants = {};
    const denied = (await handlers['intent.consume']!({
      payload: { intent },
      capability: 'intent.consume',
      method: 'consume',
      request: { protocol: 'shippie.bridge.v1', id: '2', appId: habitTracker.id, capability: 'intent.consume', method: 'consume', payload: { intent } },
    })) as IntentRequestResult;
    expect(denied.reason).toBe('permission_not_yet_granted');
    expect(denied.rows).toEqual([]);
  });
});
