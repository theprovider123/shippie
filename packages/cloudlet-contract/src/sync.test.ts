import { test, expect } from 'bun:test';
import { createUpcasterRegistry } from './sync';
import type { WorkspaceEvent } from './events';

const ev = (over: Partial<WorkspaceEvent> = {}): WorkspaceEvent => ({
  clientEventId: 'c1',
  type: 'feedback.created',
  instanceId: 'i1',
  actorUserId: 'u1',
  deviceId: 'd1',
  createdOfflineAt: '2026-06-07T00:00:00Z',
  schemaVersion: 1,
  payload: {},
  ...over,
});

test('upcast leaves an event already at the target version untouched', () => {
  const reg = createUpcasterRegistry();
  const e = ev({ schemaVersion: 3 });
  expect(reg.upcast(e, 3)).toBe(e);
});

test('a registered upcaster transforms the payload and bumps the version', () => {
  const reg = createUpcasterRegistry();
  reg.registerUpcaster('feedback.created', 1, (e) => ({
    ...e,
    schemaVersion: 2,
    payload: { ...(e.payload as object), migrated: true },
  }));
  const out = reg.upcast(ev({ schemaVersion: 1, payload: { state: 'got_it' } }), 2);
  expect(out.schemaVersion).toBe(2);
  expect(out.payload).toEqual({ state: 'got_it', migrated: true });
});

test('upcasters chain across multiple versions in order', () => {
  const reg = createUpcasterRegistry();
  reg.registerUpcaster('feedback.created', 1, (e) => ({
    ...e,
    schemaVersion: 2,
    payload: { ...(e.payload as object), v2: true },
  }));
  reg.registerUpcaster('feedback.created', 2, (e) => ({
    ...e,
    schemaVersion: 3,
    payload: { ...(e.payload as object), v3: true },
  }));
  const out = reg.upcast(ev({ schemaVersion: 1, payload: {} }), 3);
  expect(out.schemaVersion).toBe(3);
  expect(out.payload).toEqual({ v2: true, v3: true });
});

test('a version with no registered step is a no-op passthrough that still advances', () => {
  const reg = createUpcasterRegistry();
  // Only a v2→v3 step registered; v1→v2 has none and must passthrough.
  reg.registerUpcaster('feedback.created', 2, (e) => ({
    ...e,
    schemaVersion: 3,
    payload: { ...(e.payload as object), v3: true },
  }));
  const out = reg.upcast(ev({ schemaVersion: 1, payload: { keep: 1 } }), 3);
  expect(out.schemaVersion).toBe(3);
  expect(out.payload).toEqual({ keep: 1, v3: true });
});
