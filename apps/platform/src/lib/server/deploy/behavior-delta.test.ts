import { describe, expect, test } from 'vitest';
import { computeBehaviorDelta, behaviorProfileFromManifest, type BehaviorProfile } from './behavior-delta';

const base: BehaviorProfile = {
  connectDomains: [],
  externalNetwork: false,
  storage: 'none',
  capabilities: [],
  totalBytes: 1000,
  kind: 'local',
};

describe('computeBehaviorDelta', () => {
  test('first publish (prev null) → empty, low delta', () => {
    expect(computeBehaviorDelta(null, base)).toEqual({ score: 0, additions: [], high: false });
  });

  test('identical versions → zero', () => {
    const d = computeBehaviorDelta(base, { ...base });
    expect(d.score).toBe(0);
    expect(d.additions).toEqual([]);
    expect(d.high).toBe(false);
  });

  test('new connect domain is flagged', () => {
    const d = computeBehaviorDelta(base, { ...base, connectDomains: ['evil.example'] });
    expect(d.additions[0]).toContain('evil.example');
    expect(d.score).toBe(2);
  });

  test('case/whitespace-insensitive domain compare (no false positive)', () => {
    const d = computeBehaviorDelta(
      { ...base, connectDomains: ['Api.Example'] },
      { ...base, connectDomains: ['  api.example  '] },
    );
    expect(d.additions).toEqual([]);
    expect(d.score).toBe(0);
  });

  test('newly external network → high delta', () => {
    const d = computeBehaviorDelta(base, { ...base, externalNetwork: true });
    expect(d.score).toBe(3);
    expect(d.high).toBe(true);
    expect(d.additions[0]).toContain('external network');
  });

  test('storage escalation none → rw', () => {
    const d = computeBehaviorDelta(base, { ...base, storage: 'rw' });
    expect(d.score).toBe(2);
    expect(d.additions[0]).toContain('storage escalated');
  });

  test('new capability + kind change accumulate', () => {
    const d = computeBehaviorDelta(base, { ...base, capabilities: ['files'], kind: 'connected' });
    expect(d.additions.some((a) => a.includes('files'))).toBe(true);
    expect(d.additions.some((a) => a.includes('app kind changed'))).toBe(true);
    expect(d.score).toBe(3); // 1 (capability) + 2 (kind)
    expect(d.high).toBe(true);
  });

  test('bundle more than doubling is flagged', () => {
    const d = computeBehaviorDelta(base, { ...base, totalBytes: 3000 });
    expect(d.additions[0]).toContain('bundle grew');
    expect(d.score).toBe(1);
  });

  test('removing a domain is not a delta (only additions count)', () => {
    const d = computeBehaviorDelta({ ...base, connectDomains: ['a.example'] }, { ...base, connectDomains: [] });
    expect(d.score).toBe(0);
  });
});

describe('behaviorProfileFromManifest', () => {
  test('maps permissions + domains into a profile', () => {
    const profile = behaviorProfileFromManifest(
      {
        permissions: { external_network: true, auth: true, files: false, notifications: true, storage: 'rw' },
        allowed_connect_domains: ['api.example'],
      },
      { totalBytes: 2048, kind: 'connected' },
    );
    expect(profile).toEqual({
      connectDomains: ['api.example'],
      externalNetwork: true,
      storage: 'rw',
      capabilities: ['auth', 'notifications'],
      totalBytes: 2048,
      kind: 'connected',
    });
  });

  test('defaults when permissions absent', () => {
    const profile = behaviorProfileFromManifest({}, { totalBytes: 100 });
    expect(profile.externalNetwork).toBe(false);
    expect(profile.storage).toBe('none');
    expect(profile.capabilities).toEqual([]);
    expect(profile.kind).toBeNull();
  });

  test('round-trips through computeBehaviorDelta (new domain flagged)', () => {
    const v1 = behaviorProfileFromManifest({ allowed_connect_domains: [] }, { totalBytes: 100 });
    const v2 = behaviorProfileFromManifest({ allowed_connect_domains: ['tracker.example'] }, { totalBytes: 100 });
    const d = computeBehaviorDelta(v1, v2);
    expect(d.additions[0]).toContain('tracker.example');
  });
});
