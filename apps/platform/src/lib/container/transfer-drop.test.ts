/**
 * P1A.3 — `data.transferDrop` invariants.
 *
 * Three things have to hold:
 *
 *   1. `transferDrop.starting` only reaches iframes whose
 *      `acceptsTransfer.kinds` includes the announced kind. Apps with
 *      no matching declaration are NOT in the returned acceptor list.
 *   2. `transferDrop.commit` to a target that hasn't been granted yet
 *      returns `permission_not_yet_granted` and does NOT deliver the
 *      payload until the user accepts the prompt.
 *   3. After a grant lands, subsequent commits flow through silently
 *      (no second prompt for the same source→target pair).
 */
import { describe, expect, test } from 'vitest';
import {
  createTransferRegistry,
  grantTransfer,
  isTransferGranted,
  removeAppTransferGrants,
  revokeTransfer,
  type TransferGrants,
} from './transfer-registry';
import { localPermissions, type ContainerApp } from './state';
import { SHIPPIE_PERMISSIONS_SCHEMA } from '@shippie/app-package-contract';

function makeApp(slug: string, accepts?: readonly string[]): ContainerApp {
  const base = localPermissions(slug);
  const permissions = accepts
    ? {
        schema: SHIPPIE_PERMISSIONS_SCHEMA,
        capabilities: {
          ...base.capabilities,
          acceptsTransfer: { kinds: accepts },
        },
      }
    : base;
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
    permissions,
  };
}

describe('transferRegistry — kind-match scoping', () => {
  test('acceptors only surface for the kinds they declared', () => {
    const r = createTransferRegistry();
    const planner = makeApp('meal-planner', ['recipe']);
    const journal = makeApp('journal', ['note']);
    const standalone = makeApp('standalone'); // no acceptsTransfer
    r.refresh([planner, journal, standalone]);
    expect(r.acceptorsFor('recipe').map((a) => a.appSlug)).toEqual(['meal-planner']);
    expect(r.acceptorsFor('note').map((a) => a.appSlug)).toEqual(['journal']);
    expect(r.acceptorsFor('photo')).toEqual([]);
  });

  test('refreshing replaces the previous index — no stale acceptors', () => {
    const r = createTransferRegistry();
    const a = makeApp('a', ['recipe']);
    r.refresh([a]);
    expect(r.acceptorsFor('recipe')).toHaveLength(1);
    r.refresh([]);
    expect(r.acceptorsFor('recipe')).toEqual([]);
  });

  test('a single app may declare multiple kinds and is returned for each', () => {
    const r = createTransferRegistry();
    const multi = makeApp('multi', ['recipe', 'note', 'photo']);
    r.refresh([multi]);
    expect(r.acceptorsFor('recipe')).toHaveLength(1);
    expect(r.acceptorsFor('note')).toHaveLength(1);
    expect(r.acceptorsFor('photo')).toHaveLength(1);
    expect(r.allKinds()).toEqual(['note', 'photo', 'recipe']);
  });
});

describe('transferGrants — per source→target pair', () => {
  test('granted pair becomes addressable, ungranted pair stays denied', () => {
    let g: TransferGrants = {};
    expect(isTransferGranted(g, 'app_recipe', 'app_planner')).toBe(false);
    g = grantTransfer(g, 'app_recipe', 'app_planner');
    expect(isTransferGranted(g, 'app_recipe', 'app_planner')).toBe(true);
    // Other directions / pairs stay denied — grants are directional.
    expect(isTransferGranted(g, 'app_planner', 'app_recipe')).toBe(false);
    expect(isTransferGranted(g, 'app_recipe', 'app_other')).toBe(false);
  });

  test('revokeTransfer drops the grant', () => {
    let g: TransferGrants = grantTransfer({}, 'app_a', 'app_b');
    g = revokeTransfer(g, 'app_a', 'app_b');
    expect(isTransferGranted(g, 'app_a', 'app_b')).toBe(false);
  });

  test('removeAppTransferGrants drops grants where uninstalled app is source OR target', () => {
    let g: TransferGrants = {};
    g = grantTransfer(g, 'app_a', 'app_b');
    g = grantTransfer(g, 'app_b', 'app_a');
    g = grantTransfer(g, 'app_c', 'app_b');
    g = grantTransfer(g, 'app_a', 'app_c');
    g = removeAppTransferGrants(g, 'app_b');
    expect(isTransferGranted(g, 'app_a', 'app_b')).toBe(false);
    expect(isTransferGranted(g, 'app_b', 'app_a')).toBe(false);
    expect(isTransferGranted(g, 'app_c', 'app_b')).toBe(false);
    // Surviving grants are kept.
    expect(isTransferGranted(g, 'app_a', 'app_c')).toBe(true);
  });
});
