import { describe, it, expect } from 'vitest';
import {
  buildLessonMeta,
  buildPupilWhatWorks,
  deterministicStandingAdaptations,
  deterministicSummary,
  narratePupilWhatWorks,
} from './what-works';
import {
  AIBrokerRefusal,
  type AIBroker,
  type WorkspaceEvent,
} from '@shippie/cloudlet-contract';
import type { LessonRow } from './workspace-store';

const INSTANCE = 'inst-1';
const PUPIL = 'p1';

const lessons: LessonRow[] = [
  { id: 'l1', classId: 'c1', subjectId: 'maths', topic: 'Fractions', objective: 'Equivalent fractions', time: '9:00am', status: 'done' },
  { id: 'l2', classId: 'c1', subjectId: 'maths', topic: 'Fractions', objective: 'Equivalent fractions', time: '9:00am', status: 'done' },
  { id: 'l3', classId: 'c1', subjectId: 'maths', topic: 'Fractions', objective: 'Equivalent fractions', time: '9:00am', status: 'done' },
];

function fb(lessonId: string, state: string, at: string): WorkspaceEvent & { receivedAt: number } {
  return {
    clientEventId: `fb-${lessonId}-${state}`,
    type: 'feedback.created',
    instanceId: INSTANCE,
    actorUserId: 'u1',
    deviceId: 'd1',
    createdOfflineAt: at,
    schemaVersion: 1,
    payload: { lessonId, pupilId: PUPIL, state },
    receivedAt: Date.parse(at),
  };
}

const now = () => Date.parse('2026-06-07T00:00:00Z');

describe('buildLessonMeta', () => {
  it('derives each lesson date from the earliest touching event', () => {
    const events = [fb('l1', 'needs_revisit', '2026-05-01T09:10:00Z'), fb('l1', 'got_it', '2026-05-01T08:00:00Z')];
    const map = buildLessonMeta(lessons, events);
    expect(map.l1.date).toBe('2026-05-01');
    expect(map.l1.subjectId).toBe('maths');
    expect(map.l1.objective).toBe('Equivalent fractions');
  });
});

describe('buildPupilWhatWorks', () => {
  it('surfaces a recurring need with evidence once past the threshold', () => {
    const events = [
      fb('l1', 'needs_revisit', '2026-05-01T09:00:00Z'),
      fb('l2', 'nearly_there', '2026-05-08T09:00:00Z'),
    ];
    const profile = buildPupilWhatWorks({ pupilId: PUPIL, instanceId: INSTANCE, events, lessons, now });
    expect(profile.recurringNeeds).toHaveLength(1);
    expect(profile.recurringNeeds[0].evidence).toHaveLength(2);
    expect(profile.coldStart).toBe(false);
  });

  it('flags cold-start for a pupil with no events', () => {
    const profile = buildPupilWhatWorks({ pupilId: PUPIL, instanceId: INSTANCE, events: [], lessons, now });
    expect(profile.coldStart).toBe(true);
  });
});

describe('deterministic narrative (AI-free fallback)', () => {
  it('cold-start standing adaptations come from research-backed seeds', () => {
    const profile = buildPupilWhatWorks({ pupilId: PUPIL, instanceId: INSTANCE, events: [], lessons, now });
    const standing = deterministicStandingAdaptations(profile);
    expect(standing.length).toBeGreaterThan(0);
    expect(standing.every((s) => s.source === 'cold-start')).toBe(true);
    expect(deterministicSummary(profile)).toMatch(/builds automatically/i);
  });
});

describe('narratePupilWhatWorks', () => {
  const profile = buildPupilWhatWorks({
    pupilId: PUPIL,
    instanceId: INSTANCE,
    events: [
      fb('l1', 'needs_revisit', '2026-05-01T09:00:00Z'),
      fb('l2', 'needs_revisit', '2026-05-08T09:00:00Z'),
      fb('l3', 'nearly_there', '2026-05-15T09:00:00Z'),
    ],
    lessons,
    now,
  });

  it('uses the Broker output when AI is available', async () => {
    const broker: AIBroker = {
      request: async () =>
        ({
          data: { summary: 'Pre-teaching vocabulary helps most.', standingAdaptations: [{ strategy: 'Pre-teach vocab', confidence: 80, subject: 'maths' }] },
          model: 'test', cached: false, tokens: 10, auditId: 'a1',
        }) as any,
    };
    const out = await narratePupilWhatWorks(broker, profile, { userId: 'u1' });
    expect(out.source).toBe('broker');
    expect(out.summary).toMatch(/Pre-teaching/);
    expect(out.standingAdaptations[0].source).toBe('broker');
  });

  it('falls back to the deterministic narrative on Broker refusal', async () => {
    const broker: AIBroker = {
      request: async () => {
        throw new AIBrokerRefusal('ai_disabled');
      },
    };
    const out = await narratePupilWhatWorks(broker, profile, { userId: 'u1' });
    expect(out.source).toBe('aggregate');
    expect(out.summary.length).toBeGreaterThan(0);
  });

  it('does not call the model for a cold-start pupil', async () => {
    const cold = buildPupilWhatWorks({ pupilId: PUPIL, instanceId: INSTANCE, events: [], lessons, now });
    let called = false;
    const broker: AIBroker = {
      request: async () => {
        called = true;
        throw new Error('should not be called');
      },
    };
    const out = await narratePupilWhatWorks(broker, cold, { userId: 'u1' });
    expect(called).toBe(false);
    expect(out.source).toBe('aggregate');
  });
});
