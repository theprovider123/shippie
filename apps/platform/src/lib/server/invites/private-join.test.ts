import { describe, expect, test } from 'vitest';
import {
  isPrivateJoinRequest,
  privateJoinJoinTokenFromUrl,
  privateJoinRoleFromUrl,
  privateJoinSpaceIdFromUrl,
  privateJoinTransferIdFromUrl,
  privateJoinUrlForApp,
  transferIdFromValue,
} from './private-join';

describe('private join invite URLs', () => {
  test('builds the focused container join URL', () => {
    expect(privateJoinUrlForApp('match-room')).toBe(
      '/container?app=match-room&focused=1&join=private-space',
    );
  });

  test('carries a sealed transfer id into the focused join URL', () => {
    expect(privateJoinUrlForApp('match-room', { transferId: 'transfer_abcdefghijkl' })).toBe(
      '/container?app=match-room&focused=1&join=private-space&transfer=transfer_abcdefghijkl',
    );
  });

  test('carries space and role hints into the focused join URL', () => {
    expect(
      privateJoinUrlForApp('match-room', {
        spaceId: 'space_pub_final',
        role: 'viewer',
        joinToken: 'join_abcdef123',
      }),
    ).toBe(
      '/container?app=match-room&focused=1&join=private-space&space=space_pub_final&role=viewer&space_join=join_abcdef123',
    );
  });

  test('recognises current and legacy join query values', () => {
    expect(isPrivateJoinRequest(new URL('https://shippie.test/container?join=private-space'))).toBe(true);
    expect(isPrivateJoinRequest(new URL('https://shippie.test/container?join=invite'))).toBe(true);
    expect(isPrivateJoinRequest(new URL('https://shippie.test/container'))).toBe(false);
  });

  test('extracts transfer codes without accepting arbitrary short values', () => {
    expect(transferIdFromValue('transfer_abcdefghijkl')).toBe('transfer_abcdefghijkl');
    expect(transferIdFromValue('https://shippie.test/container?transfer=transfer_abcdefghijkl')).toBe(
      'transfer_abcdefghijkl',
    );
    expect(transferIdFromValue('short-code')).toBeNull();
  });

  test('reads transfer ids from private join query params', () => {
    const url = new URL('https://shippie.test/container?join=private-space&code=transfer_abcdefghijkl');
    expect(privateJoinTransferIdFromUrl(url)).toBe('transfer_abcdefghijkl');
  });

  test('reads space context from private join query params', () => {
    const url = new URL('https://shippie.test/container?space=space_pub_final&role=viewer&space_join=join_abcdef123');
    expect(privateJoinSpaceIdFromUrl(url)).toBe('space_pub_final');
    expect(privateJoinRoleFromUrl(url)).toBe('viewer');
    expect(privateJoinJoinTokenFromUrl(url)).toBe('join_abcdef123');
  });
});
