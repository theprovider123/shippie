import { describe, expect, test } from 'vitest';
import {
  createTransferRegistry,
  grantTransfer,
  isTransferGranted,
  removeAppTransferGrants,
  revokeTransfer,
  type TransferGrants,
} from './transfer-registry';
import type { ContainerApp } from './state';
import { localPermissions } from './state';

function appWithKinds(id: string, slug: string, kinds: string[] | undefined): ContainerApp {
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
        acceptsTransfer: kinds === undefined ? undefined : { kinds },
      },
    },
  };
}

describe('createTransferRegistry — acceptor indexing', () => {
  test('empty registry returns empty arrays + empty kinds', () => {
    const reg = createTransferRegistry();
    expect(reg.acceptorsFor('recipe')).toEqual([]);
    expect(reg.allKinds()).toEqual([]);
  });

  test('refresh indexes a single acceptor', () => {
    const reg = createTransferRegistry();
    reg.refresh([appWithKinds('app_meal', 'meal-planner', ['recipe'])]);
    const acceptors = reg.acceptorsFor('recipe');
    expect(acceptors.length).toBe(1);
    expect(acceptors[0]).toMatchObject({
      kind: 'recipe',
      appId: 'app_meal',
      appSlug: 'meal-planner',
      appName: 'meal-planner',
    });
  });

  test('multiple acceptors per kind are all indexed in declared order', () => {
    const reg = createTransferRegistry();
    reg.refresh([
      appWithKinds('a1', 'one', ['recipe']),
      appWithKinds('a2', 'two', ['recipe']),
      appWithKinds('a3', 'three', ['restaurant-visit']),
    ]);
    expect(reg.acceptorsFor('recipe').map((a) => a.appId)).toEqual(['a1', 'a2']);
    expect(reg.acceptorsFor('restaurant-visit').map((a) => a.appId)).toEqual(['a3']);
  });

  test('one app declaring multiple kinds is indexed under each', () => {
    const reg = createTransferRegistry();
    reg.refresh([appWithKinds('a1', 'one', ['recipe', 'restaurant-visit'])]);
    expect(reg.acceptorsFor('recipe').map((a) => a.appId)).toEqual(['a1']);
    expect(reg.acceptorsFor('restaurant-visit').map((a) => a.appId)).toEqual(['a1']);
  });

  test('refresh clears stale registrations', () => {
    const reg = createTransferRegistry();
    reg.refresh([appWithKinds('a1', 'one', ['recipe'])]);
    reg.refresh([appWithKinds('a2', 'two', ['restaurant-visit'])]);
    expect(reg.acceptorsFor('recipe')).toEqual([]);
    expect(reg.acceptorsFor('restaurant-visit').map((a) => a.appId)).toEqual(['a2']);
  });

  test('apps without acceptsTransfer are silently ignored', () => {
    const reg = createTransferRegistry();
    reg.refresh([
      appWithKinds('a1', 'one', undefined),
      appWithKinds('a2', 'two', ['recipe']),
    ]);
    expect(reg.acceptorsFor('recipe').map((a) => a.appId)).toEqual(['a2']);
  });

  test('empty kinds array registers nothing for that app', () => {
    const reg = createTransferRegistry();
    reg.refresh([appWithKinds('a1', 'one', [])]);
    expect(reg.acceptorsFor('recipe')).toEqual([]);
    expect(reg.allKinds()).toEqual([]);
  });

  test('non-string + empty-string kinds are filtered out', () => {
    const reg = createTransferRegistry();
    reg.refresh([
      appWithKinds('a1', 'one', ['recipe', '', 'note']),
    ]);
    // Non-string survives only if upstream typing slips through; we
    // assert the explicit empty-string filter at minimum.
    expect(reg.acceptorsFor('').length).toBe(0);
    expect(reg.acceptorsFor('recipe').map((a) => a.appId)).toEqual(['a1']);
    expect(reg.acceptorsFor('note').map((a) => a.appId)).toEqual(['a1']);
  });

  test('allKinds returns sorted unique kinds', () => {
    const reg = createTransferRegistry();
    reg.refresh([
      appWithKinds('a1', 'one', ['recipe', 'restaurant-visit']),
      appWithKinds('a2', 'two', ['journal-entry', 'recipe']),
    ]);
    expect(reg.allKinds()).toEqual(['journal-entry', 'recipe', 'restaurant-visit']);
  });
});

describe('isTransferGranted', () => {
  test('returns false when source app has no entry', () => {
    expect(isTransferGranted({}, 'src', 'tgt')).toBe(false);
  });

  test('returns false when target is not under granted source', () => {
    const grants: TransferGrants = { src: { other: true } };
    expect(isTransferGranted(grants, 'src', 'tgt')).toBe(false);
  });

  test('returns false when granted=false (revoked but key kept)', () => {
    const grants: TransferGrants = { src: { tgt: false } };
    expect(isTransferGranted(grants, 'src', 'tgt')).toBe(false);
  });

  test('returns true when (src, tgt) is granted', () => {
    const grants: TransferGrants = { src: { tgt: true } };
    expect(isTransferGranted(grants, 'src', 'tgt')).toBe(true);
  });
});

describe('grantTransfer', () => {
  test('new source + new target produces nested entry', () => {
    const next = grantTransfer({}, 'src', 'tgt');
    expect(next).toEqual({ src: { tgt: true } });
  });

  test('existing source + new target merges', () => {
    const grants: TransferGrants = { src: { other: true } };
    const next = grantTransfer(grants, 'src', 'tgt');
    expect(next.src).toEqual({ other: true, tgt: true });
  });

  test('existing source + existing target is idempotent', () => {
    const grants: TransferGrants = { src: { tgt: true } };
    const next = grantTransfer(grants, 'src', 'tgt');
    expect(next).toEqual({ src: { tgt: true } });
  });

  test('returns a new grants object (immutability)', () => {
    const grants: TransferGrants = { src: { other: true } };
    const next = grantTransfer(grants, 'src', 'tgt');
    expect(next).not.toBe(grants);
    expect(next.src).not.toBe(grants.src);
    expect(grants).toEqual({ src: { other: true } });
  });

  test('grants for unrelated sources are preserved', () => {
    const grants: TransferGrants = { other: { x: true } };
    const next = grantTransfer(grants, 'src', 'tgt');
    expect(next.other).toEqual({ x: true });
    expect(next.src).toEqual({ tgt: true });
  });
});

describe('revokeTransfer', () => {
  test('removes target from source map', () => {
    const grants: TransferGrants = { src: { tgt: true, keep: true } };
    const next = revokeTransfer(grants, 'src', 'tgt');
    expect(next.src).toEqual({ keep: true });
  });

  test('safe when (src, tgt) is absent', () => {
    const next = revokeTransfer({}, 'src', 'tgt');
    expect(next).toEqual({ src: {} });
  });

  test('leaves grants for other sources alone', () => {
    const grants: TransferGrants = {
      src: { tgt: true },
      other: { tgt: true },
    };
    const next = revokeTransfer(grants, 'src', 'tgt');
    expect(next.other).toEqual({ tgt: true });
  });

  test('returns a new grants object (immutability)', () => {
    const grants: TransferGrants = { src: { tgt: true } };
    const next = revokeTransfer(grants, 'src', 'tgt');
    expect(next).not.toBe(grants);
    expect(grants.src.tgt).toBe(true);
  });
});

describe('removeAppTransferGrants', () => {
  test('removes the app entirely as a source', () => {
    const grants: TransferGrants = {
      gone: { keep: true, also: true },
      stay: { keep: true },
    };
    const next = removeAppTransferGrants(grants, 'gone');
    expect(next).toEqual({ stay: { keep: true } });
  });

  test('removes the app as a target from all source maps', () => {
    const grants: TransferGrants = {
      a: { gone: true, keep: true },
      b: { gone: true },
    };
    const next = removeAppTransferGrants(grants, 'gone');
    expect(next).toEqual({ a: { keep: true } });
    // b had only `gone: true` so the source map went empty and is dropped.
    expect(next.b).toBeUndefined();
  });

  test('drops sources whose only target was the removed app', () => {
    const grants: TransferGrants = { src: { only: true } };
    const next = removeAppTransferGrants(grants, 'only');
    expect(next).toEqual({});
  });

  test('drops sources with no remaining truthy grants', () => {
    const grants: TransferGrants = { src: { tgt: false } };
    const next = removeAppTransferGrants(grants, 'unrelated');
    // The implementation strips any falsy entries during the pass; the
    // source map ends up empty and is dropped.
    expect(next).toEqual({});
  });

  test('leaves unrelated grants alone', () => {
    const grants: TransferGrants = {
      src1: { tgt1: true },
      src2: { tgt2: true },
    };
    const next = removeAppTransferGrants(grants, 'unrelated');
    expect(next).toEqual({
      src1: { tgt1: true },
      src2: { tgt2: true },
    });
  });
});
