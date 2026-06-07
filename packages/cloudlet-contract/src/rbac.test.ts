import { test, expect } from 'bun:test';
import {
  roleCan,
  createRbacDecider,
  ROLE_SCOPES,
  MVP_ROLES,
  ROLES,
  type AuthContext,
} from './index';

const ctx = (roles: AuthContext['roles']): AuthContext => ({
  instanceId: 'i1',
  userId: 'u1',
  roles,
});

test('every role has a scope entry (interface supports all eight)', () => {
  for (const role of ROLES) {
    expect(Array.isArray(ROLE_SCOPES[role])).toBe(true);
  }
});

test('MVP_ROLES are the four Uniti seeds', () => {
  expect([...MVP_ROLES].sort()).toEqual(
    ['leader', 'office_manager', 'school_admin', 'teacher'].sort(),
  );
});

test("owner '*' grants anything", () => {
  expect(roleCan(['owner'], 'delete', { type: 'anything' })).toBe(true);
});

test('school_admin can manage members; teacher cannot', () => {
  expect(roleCan(['school_admin'], 'create', { type: 'member' })).toBe(true);
  expect(roleCan(['teacher'], 'create', { type: 'member' })).toBe(false);
});

test('office_manager runs setup (invites + roster) but not classroom adaptations', () => {
  expect(roleCan(['office_manager'], 'create', { type: 'invite' })).toBe(true);
  expect(roleCan(['office_manager'], 'update', { type: 'roster' })).toBe(true);
  expect(roleCan(['office_manager'], 'update', { type: 'adaptation' })).toBe(false);
});

test('teacher owns the classroom loop (feedback wildcard + append events)', () => {
  expect(roleCan(['teacher'], 'create', { type: 'feedback' })).toBe(true);
  expect(roleCan(['teacher'], 'append', { type: 'event' })).toBe(true);
  // but cannot invite staff
  expect(roleCan(['teacher'], 'create', { type: 'invite' })).toBe(false);
});

test('leader is read-only across the school (no member management)', () => {
  expect(roleCan(['leader'], 'read', { type: 'rollup' })).toBe(true);
  expect(roleCan(['leader'], 'create', { type: 'feedback' })).toBe(false);
  expect(roleCan(['leader'], 'create', { type: 'invite' })).toBe(false);
});

test('viewer cannot append events', () => {
  expect(roleCan(['viewer'], 'append', { type: 'event' })).toBe(false);
});

test('multiple roles union their grants', () => {
  expect(roleCan(['viewer', 'teacher'], 'create', { type: 'feedback' })).toBe(true);
});

test('createRbacDecider().can mirrors roleCan', () => {
  const rbac = createRbacDecider();
  expect(rbac.can(ctx(['teacher']), 'append', { type: 'event' })).toBe(true);
  expect(rbac.can(ctx(['viewer']), 'append', { type: 'event' })).toBe(false);
});

test('prefix wildcard does not leak across resource types', () => {
  // teacher has 'feedback:*' but NOT 'feedbackbomb:*'
  expect(roleCan(['teacher'], 'create', { type: 'feedbackbomb' })).toBe(false);
});
