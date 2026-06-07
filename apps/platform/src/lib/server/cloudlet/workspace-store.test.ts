import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { createUpcasterRegistry } from '@shippie/cloudlet-contract';
import { WorkspaceStore } from './workspace-store';

// node:sqlite is a Node built-in (Node 22+). The SvelteKit/Vite resolver
// rewrites a static `import 'node:sqlite'` to a bare `sqlite` specifier and
// fails to load it, so we pull it through Node's own require — bypassing the
// bundler entirely. Production code (the DO) never touches this; only the
// Node-side unit test does.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite');

function store() {
  const db = new DatabaseSync(':memory:');
  const exec = {
    run: (sql: string, ...a: unknown[]) => {
      db.prepare(sql).run(...(a as never[]));
    },
    all: <T>(sql: string, ...a: unknown[]) => db.prepare(sql).all(...(a as never[])) as T[],
  };
  const s = new WorkspaceStore(exec);
  s.init();
  return s;
}

const ev = (id: string) => ({
  clientEventId: id,
  type: 'feedback.created',
  instanceId: 'i1',
  actorUserId: 'u1',
  deviceId: 'd1',
  createdOfflineAt: '2026-06-07T00:00:00Z',
  schemaVersion: 1,
  payload: { got: true },
});
const RECEIVED = 1_717_800_000_000; // server receipt time, injected (≠ createdOfflineAt)

describe('WorkspaceStore', () => {
  it('migrates workspace_schema_version to the current version on init', () => {
    expect(store().schemaVersion()).toBe(4);
  });
  it('appends an event and reads it back', () => {
    const s = store();
    s.appendEvent(ev('c1'), RECEIVED);
    expect(s.listEvents().map((e) => e.clientEventId)).toEqual(['c1']);
  });
  it('is append-only and dedupes by clientEventId', () => {
    const s = store();
    s.appendEvent(ev('c1'), RECEIVED);
    s.appendEvent(ev('c1'), RECEIVED);
    expect(s.listEvents()).toHaveLength(1);
  });
  it('audits with SERVER receipt time, not the client event time', () => {
    const s = store();
    s.appendEvent(ev('c1'), RECEIVED);
    const row = s.listAudit().find((a) => a.action === 'event.appended');
    expect(row?.at).toBe(RECEIVED); // server receipt, not Date.parse(createdOfflineAt)
    expect(row?.at).not.toBe(Date.parse('2026-06-07T00:00:00Z'));
  });

  it('upcasts a stale-schema replayed event before projecting it (Phase 4)', () => {
    // A device offline across an app bump replays a v1 feedback event whose
    // payload lacks the new `state` field; the v1→v2 upcaster fills it so the
    // feedback projection still applies.
    const db = new DatabaseSync(':memory:');
    const exec = {
      run: (sql: string, ...a: unknown[]) => {
        db.prepare(sql).run(...(a as never[]));
      },
      all: <T>(sql: string, ...a: unknown[]) => db.prepare(sql).all(...(a as never[])) as T[],
    };
    const reg = createUpcasterRegistry();
    reg.registerUpcaster('feedback.created', 1, (e) => ({
      ...e,
      schemaVersion: 2,
      payload: { ...(e.payload as object), state: 'got_it' },
    }));
    const s = new WorkspaceStore(exec, reg, 2);
    s.init();
    // Seed the lesson + pupil the projection joins to.
    s.seedDemoSchool(0);
    const before = s.listFeedbackForLesson('l1').find((f) => f.pupilId === 'p99');
    expect(before).toBeUndefined();
    s.appendEvent(
      {
        clientEventId: 'old-1',
        type: 'feedback.created',
        instanceId: 'i1',
        actorUserId: 'u1',
        deviceId: 'd1',
        createdOfflineAt: '2026-06-07T00:00:00Z',
        schemaVersion: 1, // stale
        payload: { lessonId: 'l1', pupilId: 'p99' }, // no `state` in v1
      },
      RECEIVED,
    );
    // Stored event was upcast to v2.
    const stored = s.listEvents().find((e) => e.clientEventId === 'old-1');
    expect(stored?.schemaVersion).toBe(2);
    // And the projection applied using the upcast-filled `state`.
    const after = s.listFeedbackForLesson('l1').find((f) => f.pupilId === 'p99');
    expect(after?.state).toBe('got_it');
  });

  it('preserves feedback for a pupil missing from the roster (tombstone-safe)', () => {
    // Conflict policy: roster changes never delete historic feedback. A
    // feedback event attaches to the pupil id even if that pupil is later
    // removed (tombstoned) and so is absent from the `pupils` table. The
    // projection must NOT require the pupil to exist.
    const s = store();
    s.seedDemoSchool(0);
    s.appendEvent(
      {
        clientEventId: 'fb-ghost',
        type: 'feedback.created',
        instanceId: 'i1',
        actorUserId: 'u1',
        deviceId: 'd1',
        createdOfflineAt: '2026-06-07T00:00:00Z',
        schemaVersion: 1,
        payload: { lessonId: 'l1', pupilId: 'removed-pupil', state: 'needs_revisit' },
      },
      RECEIVED,
    );
    // The pupil is NOT in the roster…
    expect(s.listPupils().some((p) => p.id === 'removed-pupil')).toBe(false);
    // …but the feedback is preserved against the lesson, readable by lesson…
    const onLesson = s.listFeedbackForLesson('l1').find((f) => f.pupilId === 'removed-pupil');
    expect(onLesson?.state).toBe('needs_revisit');
    // …and by pupil-timeline (joins lessons, not pupils — survives the tombstone).
    const timeline = s.listFeedbackForPupil('removed-pupil');
    expect(timeline).toHaveLength(1);
    expect(timeline[0].topic).toBeTruthy();
  });
});
