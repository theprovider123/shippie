import { test, expect } from 'bun:test';
import {
  parseCsvRoster,
  computeRosterDiff,
  initialsFrom,
  fetchNormalisedRoster,
  type DataSourceAdapter,
  type NormalisedRoster,
  type RosterSnapshot,
} from './mis';

// ── CSV fixtures ────────────────────────────────────────────────────────────

const VALID_CSV = `Pupil Name,UPN,Class,Year Group,Room,SEND,EAL,FSM
Aisha Khan,A100,4M,Year 4,R12,Y,,Y
Darius Okafor,A101,4M,Year 4,R12,,yes,
Leo Smith,A102,4M,Year 4,R12,,,1
Maya Patel,A103,3B,Year 3,R09,,,`;

// synonyms + quoted field with a comma + a truthy 'x' flag
const SYNONYM_CSV = `name,student id,reg class,yr,pp
"Smith, John",S1,5J,Year 5,x
Priya Rao,S2,5J,Year 5,`;

const MALFORMED_CSV = `Pupil Name,Class
,4M
Bob Jones,
Carol White,4M
,`;

const NO_REQUIRED_CSV = `Favourite Colour,Pet
blue,cat`;

test('parses a valid CSV into normalised pupils, classes, memberships, flags', () => {
  const { roster, errors } = parseCsvRoster(VALID_CSV);
  expect(errors).toHaveLength(0);
  expect(roster.pupils).toHaveLength(4);
  expect(roster.classes).toHaveLength(2); // 4M + 3B
  expect(roster.memberships).toHaveLength(4);

  const aisha = roster.pupils.find((p) => p.sourceId === 'A100')!;
  expect(aisha.name).toBe('Aisha Khan');
  expect(aisha.send).toBe(true);
  expect(aisha.eal).toBe(false);
  expect(aisha.fsm).toBe(true);
  expect(aisha.initials).toBe('AK');

  const darius = roster.pupils.find((p) => p.sourceId === 'A101')!;
  expect(darius.eal).toBe(true);

  const leo = roster.pupils.find((p) => p.sourceId === 'A102')!;
  expect(leo.fsm).toBe(true);

  const fourM = roster.classes.find((c) => c.sourceId === '4M')!;
  expect(fourM.yearGroup).toBe('Year 4');
  expect(fourM.room).toBe('R12');
});

test('maps synonym columns + quoted fields + x/pp flags', () => {
  const { roster, errors, columnMap } = parseCsvRoster(SYNONYM_CSV);
  expect(errors).toHaveLength(0);
  expect(columnMap.pupilName).toBe('name');
  expect(columnMap.className).toBe('reg class');
  expect(columnMap.fsm).toBe('pp');
  const john = roster.pupils.find((p) => p.sourceId === 'S1')!;
  expect(john.name).toBe('Smith, John'); // embedded comma preserved
  expect(john.fsm).toBe(true); // 'x' is truthy
});

test('skips malformed rows with clear errors but keeps the good ones', () => {
  const { roster, errors } = parseCsvRoster(MALFORMED_CSV);
  // Only "Carol White,4M" is valid.
  expect(roster.pupils).toHaveLength(1);
  expect(roster.pupils[0]!.name).toBe('Carol White');
  // Missing-name and missing-class rows reported; wholly-blank line skipped silently.
  expect(errors.some((e) => /missing pupil name/.test(e.message))).toBe(true);
  expect(errors.some((e) => /missing class/.test(e.message))).toBe(true);
  for (const e of errors) expect(e.row).toBeGreaterThan(0);
});

test('errors (does not throw) when required columns are absent', () => {
  const { roster, errors } = parseCsvRoster(NO_REQUIRED_CSV);
  expect(roster.pupils).toHaveLength(0);
  expect(errors[0]!.message).toMatch(/missing required column/);
});

test('errors on an empty file', () => {
  expect(parseCsvRoster('').errors[0]!.message).toMatch(/empty file/);
});

test('derives a stable id when the CSV has no id column', () => {
  const { roster } = parseCsvRoster('Pupil,Class\nSam Lee,6T');
  expect(roster.pupils[0]!.sourceId).toBe('6T:Sam Lee');
});

test('initialsFrom handles single + multi-part names', () => {
  expect(initialsFrom('Aisha Khan')).toBe('AK');
  expect(initialsFrom('Leo')).toBe('LE');
  expect(initialsFrom('  ')).toBe('??');
});

// ── Diff / preview ───────────────────────────────────────────────────────────

const emptyRoster = (over: Partial<NormalisedRoster> = {}): NormalisedRoster => ({
  staff: [],
  pupils: [],
  classes: [],
  memberships: [],
  groups: [],
  learnerFlags: [],
  ...over,
});

test('first import is all adds against an empty workspace', () => {
  const snapshot: RosterSnapshot = { pupils: [], classes: [], memberships: [] };
  const { roster } = parseCsvRoster(VALID_CSV);
  const diff = computeRosterDiff(snapshot, roster);
  expect(diff.empty).toBe(false);
  expect(diff.pupils.adds).toHaveLength(4);
  expect(diff.classes.adds).toHaveLength(2);
  expect(diff.memberships.adds).toHaveLength(4);
  expect(diff.pupils.deactivations).toHaveLength(0);
});

test('re-import with no change is empty (already up to date)', () => {
  const { roster } = parseCsvRoster(VALID_CSV);
  const snapshot: RosterSnapshot = {
    pupils: roster.pupils.map((p) => ({ id: p.sourceId, name: p.name, send: p.send, eal: p.eal, fsm: p.fsm, active: true })),
    classes: roster.classes.map((c) => ({ id: c.sourceId, name: c.name, yearGroup: c.yearGroup, room: c.room, active: true })),
    memberships: roster.memberships.map((m) => ({ classId: m.classSourceId, pupilId: m.pupilSourceId })),
  };
  expect(computeRosterDiff(snapshot, roster).empty).toBe(true);
});

test('a removed pupil is a DEACTIVATION, never a delete', () => {
  const snapshot: RosterSnapshot = {
    pupils: [
      { id: 'A100', name: 'Aisha Khan', send: true, eal: false, fsm: true, active: true },
      { id: 'GONE', name: 'Old Pupil', send: false, eal: false, fsm: false, active: true },
    ],
    classes: [{ id: '4M', name: '4M', yearGroup: 'Year 4', room: 'R12', active: true }],
    memberships: [{ classId: '4M', pupilId: 'A100' }, { classId: '4M', pupilId: 'GONE' }],
  };
  const roster = emptyRoster({
    pupils: [{ sourceId: 'A100', name: 'Aisha Khan', initials: 'AK', send: true, eal: false, fsm: true }],
    classes: [{ sourceId: '4M', name: '4M', yearGroup: 'Year 4', room: 'R12' }],
    memberships: [{ classSourceId: '4M', pupilSourceId: 'A100' }],
  });
  const diff = computeRosterDiff(snapshot, roster);
  expect(diff.pupils.deactivations).toEqual([{ id: 'GONE', name: 'Old Pupil' }]);
  expect(diff.memberships.removes).toContainEqual({ classSourceId: '4M', pupilSourceId: 'GONE' });
});

test('a flag change is an update with field-level deltas', () => {
  const snapshot: RosterSnapshot = {
    pupils: [{ id: 'A100', name: 'Aisha Khan', send: false, eal: false, fsm: false, active: true }],
    classes: [{ id: '4M', name: '4M', yearGroup: 'Year 4', room: 'R12', active: true }],
    memberships: [{ classId: '4M', pupilId: 'A100' }],
  };
  const roster = emptyRoster({
    pupils: [{ sourceId: 'A100', name: 'Aisha Khan', initials: 'AK', send: true, eal: false, fsm: true }],
    classes: [{ sourceId: '4M', name: '4M', yearGroup: 'Year 4', room: 'R12' }],
    memberships: [{ classSourceId: '4M', pupilSourceId: 'A100' }],
  });
  const diff = computeRosterDiff(snapshot, roster);
  expect(diff.pupils.updates).toHaveLength(1);
  const fields = diff.pupils.updates[0]!.changes.map((c) => c.field).sort();
  expect(fields).toEqual(['fsm', 'send']);
});

test('a returning pupil is a REACTIVATION', () => {
  const snapshot: RosterSnapshot = {
    pupils: [{ id: 'A100', name: 'Aisha Khan', send: false, eal: false, fsm: false, active: false }],
    classes: [{ id: '4M', name: '4M', yearGroup: 'Year 4', room: 'R12', active: true }],
    memberships: [],
  };
  const roster = emptyRoster({
    pupils: [{ sourceId: 'A100', name: 'Aisha Khan', initials: 'AK', send: false, eal: false, fsm: false }],
    classes: [{ sourceId: '4M', name: '4M', yearGroup: 'Year 4', room: 'R12' }],
    memberships: [{ classSourceId: '4M', pupilSourceId: 'A100' }],
  });
  const diff = computeRosterDiff(snapshot, roster);
  expect(diff.pupils.reactivations).toEqual([{ id: 'A100', name: 'Aisha Khan' }]);
});

test('fetchNormalisedRoster pulls all categories through the adapter interface', async () => {
  const adapter: DataSourceAdapter = {
    source: 'fake',
    isConfigured: () => true,
    fetchStaff: async () => [{ sourceId: 's1', name: 'Mr T', email: 't@x.sch', roleHint: 'teacher' }],
    fetchPupils: async () => [{ sourceId: 'p1', name: 'Sam', initials: 'SA', send: false, eal: false, fsm: false }],
    fetchClasses: async () => [{ sourceId: 'c1', name: '4M', yearGroup: 'Year 4', room: 'R1' }],
    fetchMemberships: async () => [{ classSourceId: 'c1', pupilSourceId: 'p1' }],
    fetchGroups: async () => [],
    fetchLearnerFlags: async () => [{ pupilSourceId: 'p1', send: false, eal: false, fsm: false }],
  };
  const roster = await fetchNormalisedRoster(adapter);
  expect(roster.staff).toHaveLength(1);
  expect(roster.pupils).toHaveLength(1);
  expect(roster.memberships).toHaveLength(1);
});
