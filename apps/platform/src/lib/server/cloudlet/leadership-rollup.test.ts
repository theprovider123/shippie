import { describe, it, expect } from 'vitest';
import { buildLeadershipRollup, renderRollupHtml } from './leadership-rollup';
import type { WorkspaceEvent } from '@shippie/cloudlet-contract';
import type { LessonRow, SubjectRow } from './workspace-store';

const INSTANCE = 'inst-1';

const subjects: SubjectRow[] = [
  { id: 'maths', name: 'Maths', parentId: null, color: '#2EAD73' },
  { id: 'english', name: 'English', parentId: null, color: '#3A8FCC' },
  { id: 'english.reading', name: 'Reading', parentId: 'english', color: '#3A8FCC' },
  { id: 'english.writing', name: 'Writing', parentId: 'english', color: '#2D7DB8' },
  { id: 'english.spag', name: 'SPaG', parentId: 'english', color: '#1F6DA3' },
];

const lessons: LessonRow[] = [
  { id: 'lm', classId: 'c1', subjectId: 'maths', topic: 'Fractions', objective: 'Equivalent fractions', time: '9:00am', status: 'done' },
  { id: 'lr', classId: 'c1', subjectId: 'english.reading', topic: 'Inference', objective: 'Inference', time: '10:00am', status: 'done' },
  { id: 'lw', classId: 'c1', subjectId: 'english.writing', topic: 'Cohesion', objective: 'Cohesion', time: '11:00am', status: 'done' },
];

function fb(lessonId: string, pupilId: string, state: string, at: string): WorkspaceEvent & { receivedAt: number } {
  return {
    clientEventId: `fb-${lessonId}-${pupilId}-${state}`,
    type: 'feedback.created',
    instanceId: INSTANCE,
    actorUserId: 'u1',
    deviceId: 'd1',
    createdOfflineAt: at,
    schemaVersion: 1,
    payload: { lessonId, pupilId, state },
    receivedAt: Date.parse(at),
  };
}

const roster = [
  { id: 'p1', send: true, eal: false, fsm: false, active: true },
  { id: 'p2', send: false, eal: true, fsm: false, active: true },
  { id: 'leaver', send: false, eal: false, fsm: true, active: false },
];

const now = () => Date.parse('2026-06-07T00:00:00Z');

describe('buildLeadershipRollup', () => {
  it('rolls up English strands and scopes to the active cohort', () => {
    const events = [
      fb('lm', 'p1', 'got_it', '2026-05-01T09:00:00Z'),
      fb('lr', 'p1', 'nearly_there', '2026-05-02T10:00:00Z'),
      fb('lw', 'p2', 'needs_revisit', '2026-05-03T11:00:00Z'),
      fb('lm', 'leaver', 'needs_revisit', '2026-05-01T09:00:00Z'),
    ];
    const r = buildLeadershipRollup({
      instanceId: INSTANCE,
      events,
      subjects,
      lessons,
      roster,
      activeOnly: true,
      minDataPoints: 1,
      now,
    });
    expect(r.totals.pupils).toBe(2); // leaver excluded
    const english = r.subjects.find((s) => s.subjectId === 'english')!;
    expect(english.strands).toHaveLength(3);
    // reading 60 + writing 20 → headline 40
    expect(english.pct).toBe(40);
    expect(r.includesHistoric).toBe(false);
  });

  it('includes tombstoned leavers as historic evidence', () => {
    const events = [fb('lm', 'leaver', 'needs_revisit', '2026-05-01T09:00:00Z')];
    const r = buildLeadershipRollup({
      instanceId: INSTANCE,
      events,
      subjects,
      lessons,
      roster,
      activeOnly: false,
      minDataPoints: 1,
      now,
    });
    expect(r.totals.pupils).toBe(3);
    expect(r.pupilsToRevisit.some((p) => p.pupilId === 'leaver' && !p.active)).toBe(true);
  });
});

describe('renderRollupHtml', () => {
  const r = buildLeadershipRollup({
    instanceId: INSTANCE,
    events: [
      fb('lm', 'p1', 'got_it', '2026-05-01T09:00:00Z'),
      fb('lr', 'p1', 'needs_revisit', '2026-05-02T10:00:00Z'),
    ],
    subjects,
    lessons,
    roster,
    minDataPoints: 1,
    now,
  });

  it('produces a standalone HTML doc with the honesty disclaimer', () => {
    const html = renderRollupHtml(r, {
      schoolName: 'Greenfield Primary',
      period: 'Summer Term 2026',
      generatedBy: 'A. Leader',
      resolveName: (id) => (id === 'p1' ? 'Pupil One' : id),
    });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Greenfield Primary');
    expect(html).toContain('Lesson Feedback Evidence Summary');
    expect(html).toMatch(/not formal assessment or attainment data/i);
    expect(html).toContain('Pupil One'); // name resolved
    // strands drilled down under English headline
    expect(html).toContain('Reading');
    expect(html).toContain('SPaG');
  });

  it('escapes HTML in names to avoid injection', () => {
    const html = renderRollupHtml(r, {
      schoolName: '<script>alert(1)</script>',
      resolveName: () => '<b>x</b>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
