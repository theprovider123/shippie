import { describe, expect, test } from 'bun:test';
import { resolveVisibleIds, type RosterState } from './roster';

const baked = ['snake', 'crossing', 'docklands', 'chess'];

describe('resolveVisibleIds', () => {
  test('live: baked ∩ enabled − blocked', () => {
    const r: RosterState = { kind: 'live', enabled: ['snake', 'crossing', 'chess'], blocked: ['chess'] };
    expect(resolveVisibleIds(baked, r)).toEqual(['snake', 'crossing']);
  });

  test('cached fallback behaves like live (suspended stays gone offline)', () => {
    const r: RosterState = { kind: 'cached', enabled: ['snake'], blocked: ['crossing'] };
    expect(resolveVisibleIds(baked, r)).toEqual(['snake']);
  });

  test('cold fallback fails OPEN on curation but still subtracts baked blocklist', () => {
    const r: RosterState = { kind: 'cold', enabled: [], blocked: [] };
    expect(resolveVisibleIds(baked, r)).toEqual(baked);
  });

  test('cold fallback with a baked blocklist removes blocked', () => {
    const r: RosterState = { kind: 'cold', enabled: [], blocked: ['chess'] };
    expect(resolveVisibleIds(baked, r)).toEqual(['snake', 'crossing', 'docklands']);
  });
});
