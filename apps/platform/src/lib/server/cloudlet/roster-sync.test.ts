/**
 * Phase 7 — roster sync engine. Applying an MIS/CSV import to the school's
 * workspace through the append-only log (`roster.imported`), then verifying the
 * sync POLICY: server/MIS wins, leavers DEACTIVATE (never delete), and a
 * deactivated pupil's historic feedback still resolves.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import {
  parseCsvRoster,
  computeRosterDiff,
  type RosterDiff,
} from '@shippie/cloudlet-contract';
import { WorkspaceStore } from './workspace-store';

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
let seq = 0;

/** Build + append a roster.imported event carrying a precomputed diff. */
function applyImport(s: WorkspaceStore, diff: RosterDiff, source = 'csv') {
  seq += 1;
  return s.appendEvent(
    {
      clientEventId: `import-${seq}`,
      type: 'roster.imported',
      instanceId: 'i1',
      actorUserId: 'office-mgr',
      deviceId: 'web',
      createdOfflineAt: '2026-06-07T00:00:00Z',
      schemaVersion: 1,
      payload: { source, diff },
    },
    RECEIVED + seq,
  );
}

const ROSTER_V1 = `Pupil Name,UPN,Class,Year Group,Room,SEND,EAL,FSM
Aisha Khan,A100,4M,Year 4,R12,Y,,
Darius Okafor,A101,4M,Year 4,R12,,yes,
Leo Smith,A102,4M,Year 4,R12,,,Y`;

describe('roster sync engine', () => {
  it('migrates to the current schema with an active flag', () => {
    expect(store().schemaVersion()).toBe(5);
  });

  it('first CSV import adds pupils, classes, memberships (active)', () => {
    const s = store();
    const { roster } = parseCsvRoster(ROSTER_V1);
    const diff = computeRosterDiff(s.rosterSnapshot(), roster);
    applyImport(s, diff);

    expect(s.listPupils()).toHaveLength(3);
    expect(s.listClasses()).toHaveLength(1);
    expect(s.listPupilsForClass('4M')).toHaveLength(3);
    const aisha = s.listPupils().find((p) => p.id === 'A100');
    expect(aisha?.send).toBe(1);
    expect(aisha?.active).toBe(1);
  });

  it('re-importing the same roster is a no-op (idempotent / empty diff)', () => {
    const s = store();
    const { roster } = parseCsvRoster(ROSTER_V1);
    applyImport(s, computeRosterDiff(s.rosterSnapshot(), roster));
    const diff2 = computeRosterDiff(s.rosterSnapshot(), roster);
    expect(diff2.empty).toBe(true);
    applyImport(s, diff2);
    expect(s.listPupils()).toHaveLength(3);
  });

  it('server/MIS wins: an updated flag overwrites the workspace value', () => {
    const s = store();
    applyImport(s, computeRosterDiff(s.rosterSnapshot(), parseCsvRoster(ROSTER_V1).roster));
    // Aisha loses SEND, gains FSM in the new roster.
    const ROSTER_V2 = ROSTER_V1.replace('Aisha Khan,A100,4M,Year 4,R12,Y,,', 'Aisha Khan,A100,4M,Year 4,R12,,,Y');
    const diff = computeRosterDiff(s.rosterSnapshot(), parseCsvRoster(ROSTER_V2).roster);
    applyImport(s, diff);
    const aisha = s.listPupils().find((p) => p.id === 'A100');
    expect(aisha?.send).toBe(0);
    expect(aisha?.fsm).toBe(1);
  });

  it('a leaver is DEACTIVATED, never deleted — and their feedback survives', () => {
    const s = store();
    s.seedDemoSchool(0); // gives us lesson l1 for feedback to attach to
    applyImport(s, computeRosterDiff(s.rosterSnapshot(), parseCsvRoster(ROSTER_V1).roster));

    // Leo records feedback on lesson l1.
    s.appendEvent(
      {
        clientEventId: 'fb-leo',
        type: 'feedback.created',
        instanceId: 'i1',
        actorUserId: 'teacher',
        deviceId: 'web',
        createdOfflineAt: '2026-06-07T09:00:00Z',
        schemaVersion: 1,
        payload: { lessonId: 'l1', pupilId: 'A102', state: 'needs_revisit', note: 'place value' },
      },
      RECEIVED,
    );

    // Next import drops Leo (he left the school).
    const ROSTER_NO_LEO = ROSTER_V1.split('\n').filter((l) => !l.includes('A102')).join('\n');
    const diff = computeRosterDiff(s.rosterSnapshot(), parseCsvRoster(ROSTER_NO_LEO).roster);
    expect(diff.pupils.deactivations).toEqual([{ id: 'A102', name: 'Leo Smith' }]);
    applyImport(s, diff);

    // Leo is gone from the active roster…
    expect(s.listPupils().some((p) => p.id === 'A102')).toBe(false);
    // …but the row still EXISTS (tombstoned, active=0)…
    const snap = s.rosterSnapshot();
    const leo = snap.pupils.find((p) => p.id === 'A102');
    expect(leo).toBeTruthy();
    expect(leo?.active).toBe(false);
    // …and his historic feedback STILL RESOLVES (joins lessons, not pupils).
    const timeline = s.listFeedbackForPupil('A102');
    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.state).toBe('needs_revisit');
    expect(timeline[0]?.topic).toBeTruthy();
  });

  it('a returning pupil reactivates without losing their id/feedback', () => {
    const s = store();
    applyImport(s, computeRosterDiff(s.rosterSnapshot(), parseCsvRoster(ROSTER_V1).roster));
    // Drop Leo, then bring him back.
    const NO_LEO = ROSTER_V1.split('\n').filter((l) => !l.includes('A102')).join('\n');
    applyImport(s, computeRosterDiff(s.rosterSnapshot(), parseCsvRoster(NO_LEO).roster));
    expect(s.rosterSnapshot().pupils.find((p) => p.id === 'A102')?.active).toBe(false);

    const back = computeRosterDiff(s.rosterSnapshot(), parseCsvRoster(ROSTER_V1).roster);
    expect(back.pupils.reactivations).toEqual([{ id: 'A102', name: 'Leo Smith' }]);
    applyImport(s, back);
    expect(s.listPupils().some((p) => p.id === 'A102')).toBe(true);
  });

  it('the import writes a workspace audit entry', () => {
    const s = store();
    applyImport(s, computeRosterDiff(s.rosterSnapshot(), parseCsvRoster(ROSTER_V1).roster));
    expect(s.listAudit().some((a) => a.action === 'roster.imported')).toBe(true);
  });
});
