import { describe, expect, it } from 'vitest';
import { isAliasedArcadeSlug } from './arcade-route';

describe('isAliasedArcadeSlug', () => {
  it('true for an aliased arcade game', () => expect(isAliasedArcadeSlug('snake')).toBe(true));
  it('false for docklands (renderable but not aliased)', () =>
    expect(isAliasedArcadeSlug('docklands')).toBe(false));
  it('false for a normal app', () => expect(isAliasedArcadeSlug('palate')).toBe(false));
});
