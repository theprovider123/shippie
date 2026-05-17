import { describe, expect, test } from 'vitest';
import { summariseSpaceRows, type SpaceListRow } from './private-spaces';

const baseRow: SpaceListRow = {
  spaceId: 'space_pub',
  name: 'The Crown FC',
  status: 'active',
  createdAt: '2026-05-17T10:00:00.000Z',
  archivedAt: null,
  archiveReason: null,
  joinTokenId: null,
  role: null,
  inviteId: null,
  maxClaims: null,
  claimCount: null,
  tokenExpiresAt: null,
  tokenRevokedAt: null,
  tokenCreatedAt: null,
  inviteToken: null,
  inviteMaxUses: null,
  inviteUsedCount: null,
  inviteRevokedAt: null,
};

describe('private space summaries', () => {
  test('groups join tokens by space and exposes latest token/counts', () => {
    const rows: SpaceListRow[] = [
      {
        ...baseRow,
        joinTokenId: 'join_new',
        role: 'player',
        inviteId: 'invite-2',
        maxClaims: 20,
        claimCount: 3,
        tokenExpiresAt: '2026-06-01T00:00:00.000Z',
        tokenCreatedAt: '2026-05-18T10:00:00.000Z',
        inviteToken: 'tok-new',
        inviteMaxUses: 20,
        inviteUsedCount: 3,
      },
      {
        ...baseRow,
        joinTokenId: 'join_old',
        role: 'viewer',
        inviteId: 'invite-1',
        tokenRevokedAt: '2026-05-18T09:00:00.000Z',
        tokenCreatedAt: '2026-05-17T10:00:00.000Z',
        inviteToken: 'tok-old',
        inviteUsedCount: 1,
      },
    ];

    const [space] = summariseSpaceRows(rows, Date.parse('2026-05-19T00:00:00.000Z'));
    expect(space?.id).toBe('space_pub');
    expect(space?.tokenCount).toBe(2);
    expect(space?.activeTokenCount).toBe(1);
    expect(space?.latestToken?.id).toBe('join_new');
    expect(space?.latestToken?.inviteUsedCount).toBe(3);
  });

  test('returns a space even when it has no join tokens yet', () => {
    const [space] = summariseSpaceRows([baseRow]);
    expect(space?.id).toBe('space_pub');
    expect(space?.latestToken).toBeNull();
    expect(space?.tokenCount).toBe(0);
  });
});
