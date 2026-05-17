import { describe, expect, test } from 'bun:test';
import {
  archiveSpace,
  buildSpaceUrl,
  appendSpaceCapsuleToUrl,
  createJoinToken,
  createPortableSpaceCapsule,
  createSpace,
  createSpaceCapsule,
  describeSpaceCapsule,
  decodeSpaceCapsule,
  encodeSpaceCapsule,
  isJoinTokenClaimable,
  readSpaceParams,
  rotateJoinToken,
} from './index.ts';

describe('space capsules', () => {
  test('creates an active space with owner and reusable invite tokens', () => {
    const created = createSpace({
      name: 'The Crown FC',
      spaceId: 'space_crown',
      createdAt: '2026-05-17T12:00:00.000Z',
      hostRole: 'host',
      memberRole: 'play',
      maxClaims: 20,
      expiresAt: '2026-06-01T00:00:00.000Z',
    });

    expect(created.space).toEqual({
      id: 'space_crown',
      name: 'The Crown FC',
      createdAt: '2026-05-17T12:00:00.000Z',
      status: 'active',
    });
    expect(created.hostToken.role).toBe('host');
    expect(created.hostToken.maxClaims).toBe(1);
    expect(created.inviteToken.role).toBe('play');
    expect(created.inviteToken.maxClaims).toBe(20);
  });

  test('encodes app, space, role, token, labels, and package hash into a browser-safe URL', () => {
    const token = createJoinToken({
      spaceId: 'space_crown',
      role: 'member',
      maxClaims: 20,
      expiresAt: '2026-07-20T00:00:00.000Z',
      tokenId: 'join_pub',
    });
    const capsule = createSpaceCapsule({
      spaceId: token.spaceId,
      joinToken: token.tokenId,
      role: token.role,
      maxClaims: token.maxClaims,
      expiresAt: token.expiresAt,
      appSlug: 'match-room',
      appName: 'Match Room',
      spaceName: 'The Crown FC',
      packageHash: 'sha256:abc',
      routes: [{ kind: 'hub', url: 'http://hub.local' }, { kind: 'cloud', url: 'https://shippie.app' }],
    });

    const url = buildSpaceUrl({
      baseUrl: 'https://shippie.app/run/match-room/',
      appSlug: 'match-room',
      spaceId: token.spaceId,
      joinToken: token.tokenId,
      role: token.role,
      secret: 'secret',
      capsule,
    });

    expect(url).toContain('/run/match-room/');
    expect(url).toContain('space=space_crown');
    expect(url).toContain('#');

    const params = readSpaceParams(url);
    expect(params.spaceId).toBe('space_crown');
    expect(params.joinToken).toBe('join_pub');
    expect(params.role).toBe('member');
    expect(params.secret).toBe('secret');
    expect(params.capsule?.packageHash).toBe('sha256:abc');
    expect(params.capsule?.appName).toBe('Match Room');
    expect(params.capsule?.spaceName).toBe('The Crown FC');
  });

  test('portable capsules can carry a room secret instead of a join token', () => {
    const capsule = createPortableSpaceCapsule({
      spaceId: 'match-room_pub',
      role: 'host',
      secret: 'room-secret',
      appSlug: 'match-room',
      appName: 'Match Room',
      spaceName: 'Pub board',
      purpose: 'host-space',
      routes: [{ kind: 'cloud', url: 'https://shippie.app/__shippie/signal' }],
    });
    const url = appendSpaceCapsuleToUrl('https://shippie.app/run/match-room/?room=match-room_pub', capsule);
    const params = readSpaceParams(url);
    expect(params.spaceId).toBe('match-room_pub');
    expect(params.role).toBe('host');
    expect(params.secret).toBe('room-secret');
    expect(params.capsule?.joinToken).toBeUndefined();
    expect(describeSpaceCapsule(capsule).action).toBe('Open host view');
  });

  test('rejects capsules without a join token or secret', () => {
    expect(() => createSpaceCapsule({ spaceId: 'space_1', role: 'member' })).toThrow('join token or room secret');
  });

  test('rotates join tokens without changing the space id or role', () => {
    const token = createJoinToken({
      spaceId: 'space_family',
      role: 'viewer',
      expiresAt: '2026-06-01T00:00:00.000Z',
      tokenId: 'join_old',
    });
    const rotated = rotateJoinToken(token, { maxClaims: 5, expiresAt: '2026-06-02T00:00:00.000Z' });
    expect(rotated.spaceId).toBe(token.spaceId);
    expect(rotated.role).toBe(token.role);
    expect(rotated.tokenId).not.toBe(token.tokenId);
    expect(rotated.maxClaims).toBe(5);
  });

  test('tracks claimability and archive state', () => {
    const token = createJoinToken({
      spaceId: 'space_1',
      role: 'member',
      maxClaims: 1,
      expiresAt: '2026-07-20T00:00:00.000Z',
    });
    expect(isJoinTokenClaimable(token, '2026-06-01T00:00:00.000Z')).toBe(true);
    expect(isJoinTokenClaimable({ ...token, claimCount: 1 }, '2026-06-01T00:00:00.000Z')).toBe(false);
    expect(archiveSpace({ id: 'space_1', status: 'active' }).status).toBe('archived');
  });

  test('round-trips encoded capsule payloads', () => {
    const capsule = createSpaceCapsule({ spaceId: 'space_1', joinToken: 'join_1', role: 'member' });
    expect(decodeSpaceCapsule(encodeSpaceCapsule(capsule))).toEqual(capsule);
  });
});
