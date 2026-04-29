import { describe, expect, test } from 'vitest';
import {
  createIntentRegistry,
  grantIntent,
  isIntentGranted,
  removeAppIntentGrants,
  revokeIntent,
} from './intent-registry';
import type { ContainerApp } from './state';
import { localPermissions } from './state';

function appWithIntents(
  id: string,
  slug: string,
  provides: string[] = [],
  consumes: string[] = [],
): ContainerApp {
  const base = localPermissions(slug);
  return {
    id,
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
    standaloneUrl: `/apps/${slug}`,
    permissions: {
      ...base,
      capabilities: {
        ...base.capabilities,
        crossAppIntents: { provides, consumes },
      },
    },
  };
}

describe('createIntentRegistry — provider/consumer indexing', () => {
  test('empty registry returns empty arrays', () => {
    const reg = createIntentRegistry();
    expect(reg.providersFor('shopping-list')).toEqual([]);
    expect(reg.consumersFor('shopping-list')).toEqual([]);
  });

  test('refresh indexes a single provider', () => {
    const reg = createIntentRegistry();
    reg.refresh([appWithIntents('app_recipe', 'recipe', ['shopping-list'])]);
    const providers = reg.providersFor('shopping-list');
    expect(providers.length).toBe(1);
    expect(providers[0]).toMatchObject({ appId: 'app_recipe', appSlug: 'recipe', intent: 'shopping-list' });
  });

  test('refresh indexes consumer separately from provider', () => {
    const reg = createIntentRegistry();
    reg.refresh([
      appWithIntents('app_recipe', 'recipe', ['shopping-list'], []),
      appWithIntents('app_budget', 'budget', [], ['shopping-list']),
    ]);
    expect(reg.providersFor('shopping-list').map((p) => p.appId)).toEqual(['app_recipe']);
    expect(reg.consumersFor('shopping-list').map((c) => c.appId)).toEqual(['app_budget']);
  });

  test('multiple providers per intent are all indexed', () => {
    const reg = createIntentRegistry();
    reg.refresh([
      appWithIntents('a1', 'one', ['shopping-list']),
      appWithIntents('a2', 'two', ['shopping-list']),
      appWithIntents('a3', 'three', ['meal-plan']),
    ]);
    expect(reg.providersFor('shopping-list').map((p) => p.appId)).toEqual(['a1', 'a2']);
    expect(reg.providersFor('meal-plan').map((p) => p.appId)).toEqual(['a3']);
  });

  test('refresh clears stale registrations', () => {
    const reg = createIntentRegistry();
    reg.refresh([appWithIntents('a1', 'one', ['shopping-list'])]);
    reg.refresh([appWithIntents('a2', 'two', ['meal-plan'])]);
    expect(reg.providersFor('shopping-list')).toEqual([]);
    expect(reg.providersFor('meal-plan').map((p) => p.appId)).toEqual(['a2']);
  });

  test('apps without crossAppIntents are silently ignored', () => {
    const reg = createIntentRegistry();
    const app = appWithIntents('a1', 'one');
    delete app.permissions.capabilities.crossAppIntents;
    reg.refresh([app]);
    expect(reg.providersFor('shopping-list')).toEqual([]);
  });

  test('allIntents lists distinct provider + consumer intents', () => {
    const reg = createIntentRegistry();
    reg.refresh([
      appWithIntents('a1', 'one', ['shopping-list', 'meal-plan']),
      appWithIntents('a2', 'two', [], ['shopping-list', 'budget-limit']),
    ]);
    expect(reg.allIntents().providers).toEqual(['meal-plan', 'shopping-list']);
    expect(reg.allIntents().consumers).toEqual(['budget-limit', 'shopping-list']);
  });
});

describe('intent grants — keyed by (consumer, intent)', () => {
  test('not granted by default', () => {
    expect(isIntentGranted({}, 'app_habit', 'cooked-meal')).toBe(false);
  });

  test('grantIntent records a grant per (consumer, intent)', () => {
    const next = grantIntent({}, 'app_habit', 'cooked-meal');
    expect(isIntentGranted(next, 'app_habit', 'cooked-meal')).toBe(true);
    expect(isIntentGranted(next, 'app_habit', 'workout-completed')).toBe(false);
    expect(isIntentGranted(next, 'app_other', 'cooked-meal')).toBe(false);
  });

  test('grantIntent does not mutate the input', () => {
    const before = {};
    grantIntent(before, 'app_habit', 'cooked-meal');
    expect(before).toEqual({});
  });

  test('one grant covers any provider firing the same intent', () => {
    // The whole point of this redesign — a grant is per intent, not per
    // provider. New providers don't re-prompt the user.
    const grants = grantIntent({}, 'app_habit', 'cooked-meal');
    // Verifying the shape: there's no provider id in the grant tree.
    expect(Object.keys(grants['app_habit']!)).toEqual(['cooked-meal']);
  });

  test('revokeIntent removes only the named (consumer, intent)', () => {
    let grants = {};
    grants = grantIntent(grants, 'app_habit', 'cooked-meal');
    grants = grantIntent(grants, 'app_habit', 'workout-completed');
    grants = revokeIntent(grants, 'app_habit', 'cooked-meal');
    expect(isIntentGranted(grants, 'app_habit', 'cooked-meal')).toBe(false);
    expect(isIntentGranted(grants, 'app_habit', 'workout-completed')).toBe(true);
  });

  test('removeAppIntentGrants drops every grant the app holds as consumer', () => {
    let grants = {};
    grants = grantIntent(grants, 'app_habit', 'cooked-meal');
    grants = grantIntent(grants, 'app_habit', 'workout-completed');
    grants = grantIntent(grants, 'app_other', 'cooked-meal');

    const next = removeAppIntentGrants(grants, 'app_habit');

    expect(isIntentGranted(next, 'app_habit', 'cooked-meal')).toBe(false);
    expect(isIntentGranted(next, 'app_habit', 'workout-completed')).toBe(false);
    expect(isIntentGranted(next, 'app_other', 'cooked-meal')).toBe(true);
  });
});
