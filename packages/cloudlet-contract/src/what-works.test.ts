import { test, expect } from 'bun:test';
import {
  computePupilWhatWorks,
  DEFAULT_THRESHOLDS,
  COLD_START_STRATEGIES,
  type ComputeInput,
  type LessonMeta,
} from './what-works';
import type { WorkspaceEvent } from './events';

const INSTANCE = 'inst-1';
const PUPIL = 'p1';

function lesson(id: string, date: string, subjectId: string, objective: string): LessonMeta {
  return { id, date, subjectId, objective };
}

function fb(
  lessonId: string,
  pupilId: string,
  state: string,
  note?: string,
): WorkspaceEvent {
  return {
    clientEventId: `fb-${lessonId}-${pupilId}-${state}`,
    type: 'feedback.created',
    instanceId: INSTANCE,
    actorUserId: 'u1',
    deviceId: 'd1',
    createdOfflineAt: '2026-06-01T00:00:00Z',
    schemaVersion: 1,
    payload: { lessonId, pupilId, state, note: note ?? null },
  };
}

function gen(cardId: string, lessonId: string, subjectId: string, strategy: string, ids: string[]): WorkspaceEvent {
  return {
    clientEventId: `gen-${cardId}`,
    type: 'adaptation.generated',
    instanceId: INSTANCE,
    actorUserId: 'u1',
    deviceId: 'd1',
    createdOfflineAt: '2026-06-01T00:00:00Z',
    schemaVersion: 1,
    payload: {
      source: 'rules',
      cards: [{ id: cardId, lessonId, subjectId, strategy, objective: 'O', target: { ids, label: 'x' } }],
    },
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

test('cold-start: a pupil with no events is not empty and is flagged coldStart', () => {
  const profile = computePupilWhatWorks({
    pupilId: PUPIL,
    instanceId: INSTANCE,
    events: [],
    lessons: {},
    now,
  });
  expect(profile.coldStart).toBe(true);
  expect(profile.lessonsObserved).toBe(0);
  expect(profile.confidence).toBe('emerging');
  expect(profile.recurringNeeds).toEqual([]);
  // seeds available so the UI can fall back to research-backed strategies
  expect(COLD_START_STRATEGIES.length).toBeGreaterThan(0);
});

test('a need below the occurrence threshold does NOT surface', () => {
  const lessons = { l1: lesson('l1', '2026-05-01', 'maths', 'Fractions') };
  const profile = computePupilWhatWorks({
    pupilId: PUPIL,
    instanceId: INSTANCE,
    events: [fb('l1', PUPIL, 'needs_revisit')],
    lessons,
    now,
  });
  expect(profile.recurringNeeds).toEqual([]); // 1 lesson < minLessons(2)
});

test('a need surfaces at threshold, marked emerging, with evidence links', () => {
  const lessons = {
    l1: lesson('l1', '2026-05-01', 'maths', 'Fractions'),
    l2: lesson('l2', '2026-05-08', 'maths', 'Fractions'),
  };
  const profile = computePupilWhatWorks({
    pupilId: PUPIL,
    instanceId: INSTANCE,
    events: [fb('l1', PUPIL, 'needs_revisit'), fb('l2', PUPIL, 'nearly_there')],
    lessons,
    now,
  });
  expect(profile.recurringNeeds).toHaveLength(1);
  const n = profile.recurringNeeds[0]!;
  expect(n.count).toBe(2);
  expect(n.status).toBe('emerging'); // 2 < establishedOccurrences(3)
  expect(n.crossSubject).toBe(false);
  expect(n.evidence.map((e) => e.lessonId)).toEqual(['l1', 'l2']);
  expect(n.need).not.toMatch(/weak|poor|struggl|low ability|behind/i); // no deficit language
});

test('a need across subjects becomes established + crossSubject at the higher bar', () => {
  const lessons = {
    l1: lesson('l1', '2026-05-01', 'maths', 'New vocab'),
    l2: lesson('l2', '2026-05-08', 'maths', 'New vocab'),
    l3: lesson('l3', '2026-05-15', 'maths', 'New vocab'),
    l4: lesson('l4', '2026-05-22', 'science', 'New vocab'),
  };
  const profile = computePupilWhatWorks({
    pupilId: PUPIL,
    instanceId: INSTANCE,
    events: [
      fb('l1', PUPIL, 'needs_revisit'),
      fb('l2', PUPIL, 'needs_revisit'),
      fb('l3', PUPIL, 'nearly_there'),
      fb('l4', PUPIL, 'needs_revisit'),
    ],
    lessons,
    now,
  });
  const n = profile.recurringNeeds[0]!;
  expect(n.count).toBe(4);
  expect(n.status).toBe('established');
  expect(n.crossSubject).toBe(true);
  expect(n.subjects).toEqual(['maths', 'science']);
  expect(profile.confidence).toBe('established'); // 4 lessons >= establishedLessons(4)
});

test('strategy success rate is computed from outcomes resolved back to the card', () => {
  const lessons = {
    l1: lesson('l1', '2026-05-01', 'maths', 'O'),
    l2: lesson('l2', '2026-05-08', 'maths', 'O'),
    l3: lesson('l3', '2026-05-15', 'maths', 'O'),
  };
  const profile = computePupilWhatWorks({
    pupilId: PUPIL,
    instanceId: INSTANCE,
    events: [
      gen('c1', 'l1', 'maths', 'Pre-teach vocab', [PUPIL]),
      outcome('c1', 'worked'),
      gen('c2', 'l2', 'maths', 'Pre-teach vocab', [PUPIL]),
      outcome('c2', 'worked'),
      gen('c3', 'l3', 'maths', 'Pre-teach vocab', [PUPIL]),
      outcome('c3', 'did_not_work'),
    ],
    lessons,
    now,
  });
  expect(profile.strategiesThatWork).toHaveLength(1);
  const s = profile.strategiesThatWork[0]!;
  expect(s.strategy).toBe('Pre-teach vocab');
  expect(s.n).toBe(3);
  expect(s.successRate).toBeCloseTo(2 / 3);
  expect(s.status).toBe('established');
  expect(s.evidence).toHaveLength(3);
});

test('a mostly-failing strategy lands in strategiesThatDidnt', () => {
  const lessons = {
    l1: lesson('l1', '2026-05-01', 'maths', 'O'),
    l2: lesson('l2', '2026-05-08', 'maths', 'O'),
  };
  const profile = computePupilWhatWorks({
    pupilId: PUPIL,
    instanceId: INSTANCE,
    events: [
      gen('c1', 'l1', 'maths', 'Timed drill', [PUPIL]),
      outcome('c1', 'did_not_work'),
      gen('c2', 'l2', 'maths', 'Timed drill', [PUPIL]),
      outcome('c2', 'did_not_work'),
    ],
    lessons,
    now,
  });
  expect(profile.strategiesThatWork).toEqual([]);
  expect(profile.strategiesThatDidnt).toHaveLength(1);
  expect(profile.strategiesThatDidnt[0]!.successRate).toBe(0);
});

test('outcomes for OTHER pupils are not attributed to this pupil', () => {
  const lessons = {
    l1: lesson('l1', '2026-05-01', 'maths', 'O'),
    l2: lesson('l2', '2026-05-08', 'maths', 'O'),
  };
  const profile = computePupilWhatWorks({
    pupilId: PUPIL,
    instanceId: INSTANCE,
    events: [
      gen('c1', 'l1', 'maths', 'Pair work', ['other-pupil']),
      outcome('c1', 'worked'),
      gen('c2', 'l2', 'maths', 'Pair work', ['other-pupil']),
      outcome('c2', 'worked'),
    ],
    lessons,
    now,
  });
  expect(profile.strategiesThatWork).toEqual([]);
});

test('confidence trend improves when later lessons are more secure', () => {
  const lessons = {
    l1: lesson('l1', '2026-05-01', 'maths', 'A'),
    l2: lesson('l2', '2026-05-08', 'maths', 'B'),
    l3: lesson('l3', '2026-05-15', 'maths', 'C'),
    l4: lesson('l4', '2026-05-22', 'maths', 'D'),
  };
  const profile = computePupilWhatWorks({
    pupilId: PUPIL,
    instanceId: INSTANCE,
    events: [
      fb('l1', PUPIL, 'needs_revisit'),
      fb('l2', PUPIL, 'nearly_there'),
      fb('l3', PUPIL, 'got_it'),
      fb('l4', PUPIL, 'got_it'),
    ],
    lessons,
    now,
  });
  expect(profile.confidenceTrend).toBe('improving');
});

test('a secured objective drops out of objectivesToRevisit', () => {
  const lessons = {
    l1: lesson('l1', '2026-05-01', 'maths', 'Equivalent fractions'),
    l2: lesson('l2', '2026-05-08', 'maths', 'Equivalent fractions'),
  };
  const profile = computePupilWhatWorks({
    pupilId: PUPIL,
    instanceId: INSTANCE,
    events: [fb('l1', PUPIL, 'needs_revisit'), fb('l2', PUPIL, 'got_it')],
    lessons,
    now,
  });
  expect(profile.objectivesToRevisit).toEqual([]);
});

test('thresholds are configurable', () => {
  const lessons = { l1: lesson('l1', '2026-05-01', 'maths', 'O') };
  const profile = computePupilWhatWorks({
    pupilId: PUPIL,
    instanceId: INSTANCE,
    events: [fb('l1', PUPIL, 'needs_revisit')],
    lessons,
    thresholds: { ...DEFAULT_THRESHOLDS, minOccurrences: 1, minLessons: 1 },
    now,
  });
  expect(profile.recurringNeeds).toHaveLength(1);
});
