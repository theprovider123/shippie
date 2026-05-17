import { describe, expect, test } from 'bun:test';
import { canRole, normaliseRole, rolePermissions } from './index.ts';

describe('space roles', () => {
  const roles = [
    { id: 'owner', permissions: ['write', 'invite', 'moderate'] },
    { id: 'viewer', permissions: ['read'] },
  ];

  test('keeps roles opaque but validates safe ids when declarations exist', () => {
    expect(normaliseRole('owner', roles)).toBe('owner');
    expect(normaliseRole('admin', roles)).toBe(null);
    expect(normaliseRole('bad role', [])).toBe(null);
  });

  test('resolves declared permissions', () => {
    expect(rolePermissions('owner', roles)).toEqual(['write', 'invite', 'moderate']);
    expect(canRole('viewer', 'write', roles)).toBe(false);
    expect(canRole('viewer', 'read', roles)).toBe(true);
  });
});

