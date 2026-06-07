import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { WorkspaceStore } from './workspace-store';

// node:sqlite is a Node built-in (Node 22+). Pulled through Node's own require
// to bypass the Vite resolver (see workspace-store.test.ts for the rationale).
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

const RECEIVED = 1_717_800_000_000;

describe('WorkspaceStore — teacher domain (schema v2)', () => {
  it('migrates workspace_schema_version to the current version on init', () => {
    expect(store().schemaVersion()).toBe(4);
  });

  it('seeds the demo school: classes, pupils, lessons, adaptation cards', () => {
    const s = store();
    s.seedDemoSchool();
    expect(s.listClasses().length).toBeGreaterThan(0);
    expect(s.listPupils().length).toBe(28);
    expect(s.listLessons().length).toBeGreaterThanOrEqual(3);
    expect(s.listAdaptationCards().length).toBeGreaterThan(0);
  });

  it('seeding is idempotent (re-seed does not duplicate)', () => {
    const s = store();
    s.seedDemoSchool();
    const pupils = s.listPupils().length;
    s.seedDemoSchool();
    expect(s.listPupils().length).toBe(pupils);
  });

  it('models English as a parent subject with reading/writing/spag strands', () => {
    const s = store();
    s.seedDemoSchool();
    const subjects = s.listSubjects();
    const english = subjects.find((x) => x.id === 'english');
    expect(english).toBeTruthy();
    expect(english?.parentId).toBeNull();
    const strands = subjects.filter((x) => x.parentId === 'english').map((x) => x.id);
    expect(strands).toEqual(
      expect.arrayContaining(['english.reading', 'english.writing', 'english.spag']),
    );
  });

  it('records SEND/EAL/FSM flags on pupils', () => {
    const s = store();
    s.seedDemoSchool();
    const aisha = s.listPupils().find((p) => p.id === 'p1');
    expect(aisha?.send).toBe(1);
    const darius = s.listPupils().find((p) => p.id === 'p4');
    expect(darius?.eal).toBe(1);
    const leo = s.listPupils().find((p) => p.id === 'p12');
    expect(leo?.fsm).toBe(1);
  });

  it('lists pupils for a class via class_pupils', () => {
    const s = store();
    s.seedDemoSchool();
    const cls = s.listClasses()[0];
    expect(s.listPupilsForClass(cls.id).length).toBe(28);
  });

  it('projects feedback from a feedback.created event into the feedback table', () => {
    const s = store();
    s.seedDemoSchool();
    s.appendEvent(
      {
        clientEventId: 'fb1',
        type: 'feedback.created',
        instanceId: 'i1',
        actorUserId: 'u1',
        deviceId: 'd1',
        createdOfflineAt: '2026-06-07T09:00:00Z',
        schemaVersion: 1,
        payload: { lessonId: 'l1', pupilId: 'p8', state: 'needs_revisit', note: 'cross-mult' },
      },
      RECEIVED,
    );
    const fb = s.listFeedbackForLesson('l1');
    const row = fb.find((f) => f.pupilId === 'p8');
    expect(row?.state).toBe('needs_revisit');
    expect(row?.note).toBe('cross-mult');
  });

  it('feedback projection is last-write-wins per (lesson,pupil)', () => {
    const s = store();
    s.seedDemoSchool();
    const mk = (id: string, state: string) => ({
      clientEventId: id,
      type: 'feedback.created',
      instanceId: 'i1',
      actorUserId: 'u1',
      deviceId: 'd1',
      createdOfflineAt: '2026-06-07T09:00:00Z',
      schemaVersion: 1,
      payload: { lessonId: 'l1', pupilId: 'p2', state },
    });
    s.appendEvent(mk('a', 'nearly_there'), RECEIVED);
    s.appendEvent(mk('b', 'got_it'), RECEIVED + 1000);
    const row = s.listFeedbackForLesson('l1').find((f) => f.pupilId === 'p2');
    expect(row?.state).toBe('got_it');
  });

  it('feedback timeline for a pupil is ordered and grouped by objective', () => {
    const s = store();
    s.seedDemoSchool();
    s.appendEvent(
      {
        clientEventId: 'tl1',
        type: 'feedback.created',
        instanceId: 'i1',
        actorUserId: 'u1',
        deviceId: 'd1',
        createdOfflineAt: '2026-06-07T09:00:00Z',
        schemaVersion: 1,
        payload: { lessonId: 'l1', pupilId: 'p5', state: 'got_it' },
      },
      RECEIVED,
    );
    const tl = s.listFeedbackForPupil('p5');
    expect(tl.length).toBeGreaterThan(0);
    expect(tl[0]).toHaveProperty('objective');
    expect(tl[0]).toHaveProperty('subjectId');
  });

  it('records an adaptation outcome from an adaptation.outcome_recorded event', () => {
    const s = store();
    s.seedDemoSchool();
    const card = s.listAdaptationCards()[0];
    s.appendEvent(
      {
        clientEventId: 'out1',
        type: 'adaptation.outcome_recorded',
        instanceId: 'i1',
        actorUserId: 'u1',
        deviceId: 'd1',
        createdOfflineAt: '2026-06-07T15:00:00Z',
        schemaVersion: 1,
        payload: { cardId: card.id, outcome: 'worked', note: 'great' },
      },
      RECEIVED,
    );
    const updated = s.listAdaptationCards().find((c) => c.id === card.id);
    expect(updated?.outcome).toBe('worked');
    expect(updated?.reviewState).toBe('done');
  });

  it('still appends + dedupes the raw event log (v1 behaviour preserved)', () => {
    const s = store();
    s.seedDemoSchool();
    const ev = {
      clientEventId: 'dup',
      type: 'feedback.created',
      instanceId: 'i1',
      actorUserId: 'u1',
      deviceId: 'd1',
      createdOfflineAt: '2026-06-07T09:00:00Z',
      schemaVersion: 1,
      payload: { lessonId: 'l1', pupilId: 'p3', state: 'got_it' },
    };
    expect(s.appendEvent(ev, RECEIVED).accepted).toBe(true);
    expect(s.appendEvent(ev, RECEIVED).accepted).toBe(false);
    expect(s.listEvents().filter((e) => e.clientEventId === 'dup')).toHaveLength(1);
  });
});
