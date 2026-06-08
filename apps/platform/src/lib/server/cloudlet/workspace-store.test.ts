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
const RECEIVED = Date.parse('2026-06-09T12:00:00Z'); // server receipt time, injected (≠ createdOfflineAt)

describe('WorkspaceStore', () => {
  it('migrates workspace_schema_version to the current version on init', () => {
    expect(store().schemaVersion()).toBe(5);
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

// ── Phase 9 — compliance + trust ────────────────────────────────────────────

const fbEvent = (
  id: string,
  pupilId: string,
  note: string | null,
  updatedAt = RECEIVED,
) => ({
  event: {
    clientEventId: id,
    type: 'feedback.created',
    instanceId: 'i1',
    actorUserId: 'u1',
    deviceId: 'd1',
    createdOfflineAt: '2026-06-07T00:00:00Z',
    schemaVersion: 1,
    payload: { lessonId: 'l1', pupilId, state: 'needs_revisit', note },
  },
  at: updatedAt,
});

const rosterImportedEvent = (id: string, pupilId: string, classId: string) => ({
  clientEventId: id,
  type: 'roster.imported',
  instanceId: 'i1',
  actorUserId: 'u1',
  deviceId: 'd1',
  createdOfflineAt: '2026-06-07T00:00:00Z',
  schemaVersion: 1,
  payload: {
    source: 'test',
    diff: {
      pupils: {
        adds: [
          {
            sourceId: pupilId,
            name: 'Erasure Test',
            initials: 'ET',
            send: false,
            eal: false,
            fsm: false,
          },
        ],
      },
      classes: {
        adds: [{ sourceId: classId, name: '4T', yearGroup: 'Year 4', room: 'Test' }],
      },
      memberships: {
        adds: [{ classSourceId: classId, pupilSourceId: pupilId }],
      },
    },
  },
});

describe('WorkspaceStore — Phase 9 compliance', () => {
  it('flags a safeguarding-tripping note and withholds its text by default (4b)', () => {
    const s = store();
    s.seedDemoSchool(0);
    const e = fbEvent('sg-1', 'p2', 'Pupil disclosed neglect at home — referred to DSL.');
    s.appendEvent(e.event, e.at);

    const general = s.listFeedbackForLesson('l1').find((f) => f.pupilId === 'p2');
    expect(general?.safeguarding).toBe(1);
    expect(general?.note).toBeNull(); // text withheld from the general surface

    const authorised = s
      .listFeedbackForLesson('l1', { includeSafeguarding: true })
      .find((f) => f.pupilId === 'p2');
    expect(authorised?.note).toContain('neglect'); // visible to an authorised reader

    // The pupil timeline applies the same restriction.
    const tl = s.listFeedbackForPupil('p2').find((f) => f.lessonId === 'l1');
    expect(tl?.note).toBeNull();
    expect(tl?.safeguarding).toBe(1);
  });

  it('leaves a normal pedagogical note visible', () => {
    const s = store();
    s.seedDemoSchool(0);
    const e = fbEvent('ok-1', 'p3', 'Needs the column method modelled again.');
    s.appendEvent(e.event, e.at);
    const f = s.listFeedbackForLesson('l1').find((x) => x.pupilId === 'p3');
    expect(f?.safeguarding).toBe(0);
    expect(f?.note).toContain('column method');
  });

  it('builds a full export including safeguarding note text + event log', () => {
    const s = store();
    s.seedDemoSchool(0);
    s.appendEvent(fbEvent('sg-2', 'p2', 'self-harm concern raised').event, RECEIVED);
    const exp = s.buildExport(RECEIVED);
    expect(exp.schemaVersion).toBe(5);
    expect(exp.roster.pupils.length).toBeGreaterThan(0);
    expect(exp.events.length).toBeGreaterThan(0);
    expect(exp.audit.length).toBeGreaterThan(0);
    // The school's OWN export carries the safeguarding note text in full.
    const sg = exp.feedback.find((f) => f.pupilId === 'p2' && f.lessonId === 'l1');
    expect(sg?.note).toContain('self-harm');
  });

  it('erases one pupil: purges PII, keeps anonymised aggregate + tombstone', () => {
    const s = store();
    const pupilId = 'erase-pupil';
    s.appendEvent(rosterImportedEvent('era-roster', pupilId, 'erase-class'), RECEIVED - 2);
    s.appendEvent(fbEvent('era-1', pupilId, 'Will benefit from a reading buddy.').event, RECEIVED);
    expect(s.listPupils().some((p) => p.id === pupilId)).toBe(true);

    const res = s.erasePupil(pupilId, RECEIVED, 'parental request');
    expect(res.notesPurged).toBe(1);
    expect(res.alreadyErased).toBe(false);

    // Roster PII gone.
    expect(s.listPupils().some((p) => p.id === pupilId)).toBe(false);
    expect(s.rosterSnapshot().pupils.some((p) => p.id === pupilId)).toBe(false);
    // Aggregate (feedback state) survives, note text purged.
    const f = s
      .listFeedbackForLesson('l1', { includeSafeguarding: true })
      .find((x) => x.pupilId === pupilId);
    expect(f?.state).toBe('needs_revisit');
    expect(f?.note).toBeNull();
    // Tombstone recorded + erasure audited.
    expect(s.listTombstones().some((t) => t.id === pupilId)).toBe(true);
    expect(s.listAudit().some((a) => a.action === 'pupil.erased')).toBe(true);

    // Idempotent.
    expect(s.erasePupil(pupilId, RECEIVED).alreadyErased).toBe(true);
  });

  it('eraseAll purges every table and records the erasure', () => {
    const s = store();
    s.seedDemoSchool(0);
    s.appendEvent(fbEvent('all-1', 'p6', 'note').event, RECEIVED);
    const counts = s.eraseAll(RECEIVED);
    expect(counts.events).toBeGreaterThan(0);
    expect(s.listEvents()).toHaveLength(0);
    expect(s.listPupils()).toHaveLength(0);
    // The erasure marker is the only surviving audit row.
    expect(s.listAudit()).toEqual([
      expect.objectContaining({ action: 'workspace.erased' }),
    ]);
  });

  it('applyRetention purges raw note text older than N months, keeps state', () => {
    const s = store();
    const now = 1_800_000_000_000;
    const recent = now - 10 * 24 * 60 * 60 * 1000; // 10 days ago
    const old = now - 200 * 24 * 60 * 60 * 1000; // ~6.5 months ago
    // Use non-demo pupil ids so this test isolates the two explicit notes.
    s.appendEvent(fbEvent('ret-old', 'ret-pupil-old', 'old note', old).event, old);
    s.appendEvent(fbEvent('ret-new', 'ret-pupil-new', 'recent note', recent).event, recent);

    // No policy set → no purge.
    expect(s.applyRetention(now).notesPurged).toBe(0);

    s.setSetting('retention_notes_months', '3', now);
    const res = s.applyRetention(now);
    expect(res.notesPurged).toBe(1);

    const oldF = s.listFeedbackForLesson('l1', { includeSafeguarding: true }).find((f) => f.pupilId === 'ret-pupil-old');
    expect(oldF?.note).toBeNull(); // purged
    expect(oldF?.state).toBe('needs_revisit'); // aggregate kept
    const newF = s.listFeedbackForLesson('l1').find((f) => f.pupilId === 'ret-pupil-new');
    expect(newF?.note).toContain('recent note'); // within window
    expect(s.listAudit().some((a) => a.action === 'retention.applied')).toBe(true);
  });
});
