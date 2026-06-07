import { test, expect } from 'bun:test';
import {
  computeLeadershipRollup,
  EVIDENCE_BASIS,
  EVIDENCE_DISCLAIMER,
  type RollupSubject,
  type RollupLessonMeta,
  type RosterPupil,
  type WorkspaceEvent,
} from './index';

const INSTANCE = 'inst-1';

const SUBJECTS: RollupSubject[] = [
  { id: 'maths', name: 'Maths', parentId: null, color: '#2EAD73' },
  { id: 'english', name: 'English', parentId: null, color: '#3A8FCC' },
  { id: 'english.reading', name: 'Reading', parentId: 'english', color: '#3A8FCC' },
  { id: 'english.writing', name: 'Writing', parentId: 'english', color: '#2D7DB8' },
  { id: 'english.spag', name: 'SPaG', parentId: 'english', color: '#1F6DA3' },
];

function pupil(id: string, opts: Partial<RosterPupil> = {}): RosterPupil {
  return { id, send: false, eal: false, fsm: false, active: true, ...opts };
}

function lesson(id: string, date: string, subjectId: string, objective: string): RollupLessonMeta {
  return { id, date, subjectId, objective };
}

function fb(lessonId: string, pupilId: string, state: string): WorkspaceEvent {
  return {
    clientEventId: `fb-${lessonId}-${pupilId}-${state}`,
    type: 'feedback.created',
    instanceId: INSTANCE,
    actorUserId: 'u1',
    deviceId: 'd1',
    createdOfflineAt: '2026-06-01T00:00:00Z',
    schemaVersion: 1,
    payload: { lessonId, pupilId, state },
  };
}

function gen(
  cardId: string,
  lessonId: string,
  subjectId: string,
  strategy: string,
  ids: string[],
  objective = 'O',
): WorkspaceEvent {
  return {
    clientEventId: `gen-${cardId}`,
    type: 'adaptation.generated',
    instanceId: INSTANCE,
    actorUserId: 'u1',
    deviceId: 'd1',
    createdOfflineAt: '2026-06-01T00:00:00Z',
    schemaVersion: 1,
    payload: { cards: [{ id: cardId, lessonId, subjectId, strategy, objective, target: { ids } }] },
  };
}

function outcome(cardId: string, value: string): WorkspaceEvent {
  return {
    clientEventId: `out-${cardId}-${value}`,
    type: 'adaptation.outcome_recorded',
    instanceId: INSTANCE,
    actorUserId: 'u1',
    deviceId: 'd1',
    createdOfflineAt: '2026-06-01T00:00:00Z',
    schemaVersion: 1,
    payload: { cardId, outcome: value },
  };
}

const now = () => Date.parse('2026-06-07T00:00:00Z');

const base = (over: Partial<Parameters<typeof computeLeadershipRollup>[0]> = {}) =>
  computeLeadershipRollup({
    instanceId: INSTANCE,
    events: [],
    subjects: SUBJECTS,
    lessons: {},
    roster: [],
    minDataPoints: 1,
    now,
    ...over,
  });

test('honesty guard: never claims attainment — labels everything feedback-based', () => {
  const r = base();
  expect(r.evidenceBasis).toBe(EVIDENCE_BASIS);
  expect(r.evidenceBasis).toBe('lesson feedback evidence');
  expect(r.disclaimer).toBe(EVIDENCE_DISCLAIMER);
  // No metric is LABELLED as attainment/statutory. The disclaimer is allowed to
  // mention "attainment" only to DENY it ("...not formal assessment or
  // attainment data"), so exclude it from the scan.
  const { disclaimer, ...rest } = r;
  expect(JSON.stringify(rest)).not.toMatch(/attainment|statutory/i);
});

test('subject progress averages feedback scores per subject', () => {
  const r = base({
    roster: [pupil('p1'), pupil('p2')],
    lessons: { l1: lesson('l1', '2026-05-01', 'maths', 'Fractions') },
    events: [fb('l1', 'p1', 'got_it'), fb('l1', 'p2', 'nearly_there')],
  });
  const maths = r.subjects.find((s) => s.subjectId === 'maths')!;
  expect(maths.pct).toBe(80); // (100 + 60) / 2
  expect(maths.dataPoints).toBe(2);
});

test('absent feedback does not count toward the average', () => {
  const r = base({
    roster: [pupil('p1'), pupil('p2')],
    lessons: { l1: lesson('l1', '2026-05-01', 'maths', 'Fractions') },
    events: [fb('l1', 'p1', 'got_it'), fb('l1', 'p2', 'absent')],
  });
  const maths = r.subjects.find((s) => s.subjectId === 'maths')!;
  expect(maths.pct).toBe(100);
  expect(maths.dataPoints).toBe(1);
});

test('English rolls up its Reading/Writing/SPaG strands with drill-down', () => {
  const r = base({
    roster: [pupil('p1')],
    lessons: {
      lr: lesson('lr', '2026-05-01', 'english.reading', 'Inference'),
      lw: lesson('lw', '2026-05-02', 'english.writing', 'Cohesion'),
      ls: lesson('ls', '2026-05-03', 'english.spag', 'Commas'),
    },
    events: [
      fb('lr', 'p1', 'got_it'), // 100
      fb('lw', 'p1', 'nearly_there'), // 60
      fb('ls', 'p1', 'needs_revisit'), // 20
    ],
  });
  const english = r.subjects.find((s) => s.subjectId === 'english')!;
  // headline = roll-up of the three strands: (100+60+20)/3 = 60
  expect(english.pct).toBe(60);
  expect(english.dataPoints).toBe(3);
  // drill-down: three strands, each with its own pct
  expect(english.strands.map((s) => s.subjectId).sort()).toEqual([
    'english.reading',
    'english.spag',
    'english.writing',
  ]);
  const reading = english.strands.find((s) => s.subjectId === 'english.reading')!;
  expect(reading.pct).toBe(100);
  const spag = english.strands.find((s) => s.subjectId === 'english.spag')!;
  expect(spag.pct).toBe(20);
  // leaf subjects have no strands
  expect(r.subjects.find((s) => s.subjectId === 'maths')!.strands).toEqual([]);
});

test('pupils-to-revisit lists pupils whose LATEST feedback is not secure', () => {
  const r = base({
    roster: [pupil('p1'), pupil('p2')],
    lessons: {
      l1: lesson('l1', '2026-05-01', 'maths', 'Fractions'),
      l2: lesson('l2', '2026-05-08', 'maths', 'Fractions'),
    },
    events: [
      fb('l1', 'p1', 'needs_revisit'),
      fb('l2', 'p1', 'got_it'), // p1 recovered → drops out
      fb('l1', 'p2', 'got_it'),
      fb('l2', 'p2', 'needs_revisit'), // p2 latest not secure → in
    ],
  });
  expect(r.pupilsToRevisit.map((p) => p.pupilId)).toEqual(['p2']);
  expect(r.pupilsToRevisit[0]!.objectives[0]!.objective).toBe('Fractions');
});

test('adaptations-used counts generated cards by strategy', () => {
  const r = base({
    roster: [pupil('p1')],
    lessons: { l1: lesson('l1', '2026-05-01', 'maths', 'O') },
    events: [
      gen('c1', 'l1', 'maths', 'Pre-teach vocab', ['p1']),
      gen('c2', 'l1', 'maths', 'Pre-teach vocab', ['p1']),
      gen('c3', 'l1', 'maths', 'Worked example', ['p1']),
    ],
  });
  expect(r.adaptationsUsed[0]).toEqual({
    strategy: 'Pre-teach vocab',
    timesUsed: 2,
    subjects: ['maths'],
  });
});

test('top strategies rank by success rate across the cohort, broken by group', () => {
  const r = base({
    roster: [pupil('p1', { send: true }), pupil('p2', { eal: true })],
    lessons: {
      l1: lesson('l1', '2026-05-01', 'maths', 'O'),
      l2: lesson('l2', '2026-05-08', 'maths', 'O'),
    },
    events: [
      gen('c1', 'l1', 'maths', 'Pre-teach vocab', ['p1']),
      outcome('c1', 'worked'),
      gen('c2', 'l2', 'maths', 'Pre-teach vocab', ['p2']),
      outcome('c2', 'worked'),
    ],
  });
  expect(r.topStrategies).toHaveLength(1);
  const s = r.topStrategies[0]!;
  expect(s.strategy).toBe('Pre-teach vocab');
  expect(s.successRate).toBe(1);
  expect(s.n).toBe(2);
  expect(s.byGroup.SEND).toEqual({ successRate: 1, n: 1 });
  expect(s.byGroup.EAL).toEqual({ successRate: 1, n: 1 });
});

test('inclusion view breaks outcomes by SEND/EAL/FSM', () => {
  const r = base({
    roster: [pupil('p1', { send: true }), pupil('p2', { eal: true, fsm: true })],
    lessons: { l1: lesson('l1', '2026-05-01', 'maths', 'O') },
    events: [fb('l1', 'p1', 'needs_revisit'), fb('l1', 'p2', 'got_it')],
  });
  const send = r.inclusion.find((g) => g.group === 'SEND')!;
  expect(send.pupils).toBe(1);
  expect(send.pct).toBe(20);
  expect(send.needSupportPct).toBe(100);
  const eal = r.inclusion.find((g) => g.group === 'EAL')!;
  expect(eal.pct).toBe(100);
  const all = r.inclusion.find((g) => g.group === 'all')!;
  expect(all.pct).toBe(60);
});

test('adaptation impact: improvement after a flagged strategy is measured', () => {
  const r = base({
    roster: [pupil('p1')],
    lessons: {
      l1: lesson('l1', '2026-05-01', 'maths', 'Fractions'),
      l2: lesson('l2', '2026-05-08', 'maths', 'Fractions'),
      l3: lesson('l3', '2026-05-15', 'maths', 'Fractions'),
    },
    events: [
      fb('l1', 'p1', 'needs_revisit'), // before: 20
      gen('c1', 'l2', 'maths', 'Pre-teach vocab', ['p1'], 'Fractions'),
      outcome('c1', 'worked'),
      fb('l2', 'p1', 'nearly_there'),
      fb('l3', 'p1', 'got_it'), // after: 100
    ],
  });
  expect(r.adaptationImpact.flaggedCount).toBe(1);
  expect(r.adaptationImpact.improvedCount).toBe(1);
  expect(r.adaptationImpact.improvedRate).toBe(1);
  expect(r.adaptationImpact.avgScoreDelta).toBeGreaterThan(0);
});

test('activeOnly scopes to the current cohort; historic includes tombstoned leavers', () => {
  const roster = [pupil('p1'), pupil('leaver', { active: false })];
  const lessons = { l1: lesson('l1', '2026-05-01', 'maths', 'O') };
  const events = [fb('l1', 'p1', 'got_it'), fb('l1', 'leaver', 'needs_revisit')];

  const current = base({ roster, lessons, events, activeOnly: true });
  expect(current.totals.pupils).toBe(1);
  expect(current.subjects.find((s) => s.subjectId === 'maths')!.pct).toBe(100); // only p1
  expect(current.includesHistoric).toBe(false);

  const historic = base({ roster, lessons, events, activeOnly: false });
  expect(historic.totals.pupils).toBe(2);
  expect(historic.subjects.find((s) => s.subjectId === 'maths')!.pct).toBe(60); // (100+20)/2
  expect(historic.includesHistoric).toBe(true);
  // the leaver's not-secure feedback still surfaces as historic evidence
  expect(historic.pupilsToRevisit.some((p) => p.pupilId === 'leaver' && !p.active)).toBe(true);
});

test('minDataPoints suppresses noisy low-N subject percentages', () => {
  const r = base({
    minDataPoints: 3,
    roster: [pupil('p1')],
    lessons: { l1: lesson('l1', '2026-05-01', 'maths', 'O') },
    events: [fb('l1', 'p1', 'got_it')],
  });
  expect(r.subjects.find((s) => s.subjectId === 'maths')!.pct).toBeNull();
  expect(r.subjects.find((s) => s.subjectId === 'maths')!.dataPoints).toBe(1);
});

test('no deficit/diagnosis language in output keys or disclaimer', () => {
  const r = base({
    roster: [pupil('p1', { send: true })],
    lessons: { l1: lesson('l1', '2026-05-01', 'maths', 'O') },
    events: [fb('l1', 'p1', 'needs_revisit')],
  });
  expect(r.disclaimer).not.toMatch(/weak|poor|struggl|low ability|behind|deficit/i);
});
