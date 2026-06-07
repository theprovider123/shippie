import { test, expect } from 'bun:test';
import { ROLES, type Role } from './index';

test('ROLES contains the eight cloudlet roles', () => {
  expect(ROLES).toEqual([
    'owner','school_admin','office_manager','leader',
    'teacher','teaching_assistant','specialist','viewer',
  ]);
});

test('a WorkspaceEvent requires dedupe + tenancy fields', () => {
  const e = {
    clientEventId: 'c1', type: 'feedback.created', instanceId: 'i1',
    actorUserId: 'u1', deviceId: 'd1', createdOfflineAt: '2026-06-07T00:00:00Z',
    schemaVersion: 1, payload: {},
  } satisfies import('./events').WorkspaceEvent;
  expect(e.clientEventId).toBe('c1');
});
