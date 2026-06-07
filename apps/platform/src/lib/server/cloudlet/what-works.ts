/**
 * "What helps [pupil]" — the server-side composition of the reusable
 * `computePupilWhatWorks` primitive (Phase 6, the moat).
 *
 * Two layers, one shape:
 *   - `buildPupilWhatWorks` — DETERMINISTIC, no AI. Reads the school's
 *     append-only event log + lessons, derives the longitudinal profile via the
 *     pure contract primitive. ALWAYS available; the offline-safe default and
 *     the fallback the AI narrative degrades to.
 *   - `narratePupilWhatWorks` — OPTIONAL. Turns the deterministic aggregates +
 *     recent (pseudonymised) notes into a short teacher-readable "what helps"
 *     summary + suggested STANDING adaptations, THROUGH the AIBroker (so
 *     safeguarding/pseudonymise/audit/cache/budget all apply). Falls back to a
 *     deterministic narrative on any Broker refusal.
 *
 * Cold-start: a pupil with too little signal is seeded with research-backed
 * (EEF) strategies so the screen is never empty. AI proposes; the human owns.
 * NO deficit/diagnosis language anywhere.
 */
import {
  computePupilWhatWorks,
  COLD_START_STRATEGIES,
  AIBrokerRefusal,
  type PupilWhatWorks,
  type LessonMeta,
  type WhatWorksThresholds,
  type AIBroker,
  type AIRequest,
  type JsonSchema,
  type Sensitivity,
} from '@shippie/cloudlet-contract';
import type { WorkspaceEvent } from '@shippie/cloudlet-contract';
import type { LessonRow } from './workspace-store';

export interface BuildInput {
  pupilId: string;
  instanceId: string;
  events: Array<WorkspaceEvent & { receivedAt?: number }>;
  lessons: LessonRow[];
  thresholds?: WhatWorksThresholds;
  now?: () => number;
}

/**
 * Build the `LessonMeta` map the pure primitive needs. Lesson rows carry a
 * display `time` ("9:00am") not a real date, so we derive each lesson's DATE
 * from the EARLIEST event that touched it (feedback for that lesson, or a
 * generated card on it) — the `createdOfflineAt` client clock, falling back to
 * the server `receivedAt`. This keeps evidence dates honest and stable.
 */
export function buildLessonMeta(
  lessons: LessonRow[],
  events: Array<WorkspaceEvent & { receivedAt?: number }>,
): Record<string, LessonMeta> {
  const dateByLesson = new Map<string, string>();
  const consider = (lessonId: string | null | undefined, iso: string) => {
    if (!lessonId) return;
    const cur = dateByLesson.get(lessonId);
    if (!cur || iso < cur) dateByLesson.set(lessonId, iso);
  };
  for (const e of events) {
    const iso = e.createdOfflineAt || (e.receivedAt ? new Date(e.receivedAt).toISOString() : '');
    if (!iso) continue;
    const p = (e.payload ?? {}) as Record<string, unknown>;
    if (e.type === 'feedback.created') consider(p.lessonId as string, iso);
    else if (e.type === 'adaptation.generated') {
      const cards = (p.cards ?? []) as Array<{ lessonId?: string | null }>;
      for (const c of cards) consider(c.lessonId, iso);
    }
  }
  const map: Record<string, LessonMeta> = {};
  for (const l of lessons) {
    map[l.id] = {
      id: l.id,
      // YYYY-MM-DD slice keeps the UI date compact + comparisons lexicographic.
      date: (dateByLesson.get(l.id) ?? new Date(0).toISOString()).slice(0, 10),
      subjectId: l.subjectId,
      objective: l.objective || l.topic,
    };
  }
  return map;
}

/** Deterministic profile — no AI. Always available. */
export function buildPupilWhatWorks(input: BuildInput): PupilWhatWorks {
  return computePupilWhatWorks({
    pupilId: input.pupilId,
    instanceId: input.instanceId,
    events: input.events,
    lessons: buildLessonMeta(input.lessons, input.events),
    thresholds: input.thresholds,
    now: input.now,
  });
}

/** A suggested STANDING adaptation — a teaching move that should pre-load into
 * future lessons for this pupil. Mirrors the prototype's `standingAdaptations`. */
export interface StandingAdaptation {
  strategy: string;
  /** Why it's suggested, in teacher language (evidence-grounded). */
  basedOn: string;
  /** 0..100 for the prototype confidence bar. */
  confidence: number;
  subject: string;
  /** Provenance for governance + eval. */
  source: 'aggregate' | 'broker' | 'cold-start';
}

export interface WhatWorksNarrative {
  /** Short teacher-readable "what helps" summary (2–3 sentences). */
  summary: string;
  standingAdaptations: StandingAdaptation[];
  source: 'broker' | 'aggregate';
}

/**
 * Derive standing adaptations from the DETERMINISTIC profile. This is the
 * always-available fallback (AI off / over budget / no model) and the seed the
 * Broker enriches. Cold-start pupils fall back to EEF research-backed moves.
 */
export function deterministicStandingAdaptations(
  profile: PupilWhatWorks,
): StandingAdaptation[] {
  if (profile.strategiesThatWork.length > 0) {
    return profile.strategiesThatWork.slice(0, 4).map((s) => ({
      strategy: s.strategy,
      basedOn: `worked ${Math.round(s.successRate * s.n)}/${s.n} times${
        s.subjects.length ? ` in ${s.subjects.join(', ')}` : ''
      }`,
      confidence: Math.round(s.successRate * 100),
      subject: s.subjects[0] ?? 'All subjects',
      source: 'aggregate',
    }));
  }
  // Cold-start: research-backed strategies so a new pupil is never empty.
  return COLD_START_STRATEGIES.slice(0, 3).map((s) => ({
    strategy: s.strategy,
    basedOn: 'research-backed starting point — builds as you record outcomes',
    confidence: 50,
    subject: 'All subjects',
    source: 'cold-start',
  }));
}

/** A deterministic, AI-free summary sentence. */
export function deterministicSummary(profile: PupilWhatWorks): string {
  if (profile.coldStart) {
    return 'Not enough lessons yet to spot patterns — this builds automatically as you record what helps. A few research-backed starting points are below.';
  }
  const parts: string[] = [];
  const best = profile.strategiesThatWork[0];
  if (best)
    parts.push(
      `${best.strategy} has helped most (${Math.round(best.successRate * 100)}% over ${best.n} lessons).`,
    );
  const need = profile.recurringNeeds[0];
  if (need)
    parts.push(
      `A recurring focus is "${need.need}"${need.crossSubject ? ' across subjects' : ''}.`,
    );
  const trend = { improving: 'Recent lessons are trending up.', steady: '', dipping: 'Worth a closer look — recent lessons have dipped.' }[
    profile.confidenceTrend
  ];
  if (trend) parts.push(trend);
  return parts.join(' ') || 'Patterns are still emerging — keep recording what helps.';
}

/** JSON schema the Broker validates the narrative output against. */
export const WHAT_WORKS_NARRATIVE_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['summary'],
  properties: { summary: { type: 'string' }, standingAdaptations: { type: 'array' } },
};

/**
 * OPTIONAL AI narrative through the governed Broker. The deterministic profile
 * is the input AND the fallback: on ANY Broker refusal (AI off / over budget /
 * no model / schema invalid) we return the deterministic narrative. The model
 * only ever proposes wording + standing adaptations — the human owns them, and
 * cards/standing adaptations are never auto-applied.
 */
export async function narratePupilWhatWorks(
  broker: AIBroker,
  profile: PupilWhatWorks,
  opts: {
    userId: string;
    pupilName?: string;
    /** Recent pupil notes (will be pseudonymised + safeguarding-scanned by the Broker). */
    recentNotes?: string[];
    appId?: string;
    sensitivity?: Sensitivity;
  },
): Promise<WhatWorksNarrative> {
  const fallback: WhatWorksNarrative = {
    summary: deterministicSummary(profile),
    standingAdaptations: deterministicStandingAdaptations(profile),
    source: 'aggregate',
  };
  // Nothing to narrate yet — don't spend a model call on a cold-start pupil.
  if (profile.coldStart) return fallback;

  const req: AIRequest = {
    appId: opts.appId ?? 'uniti',
    instanceId: profile.instanceId,
    userId: opts.userId,
    purpose: 'whatworks.narrate',
    sensitivity: opts.sensitivity ?? 'pseudonymised',
    inputRefs: [{ kind: 'pupil', id: profile.pupilId }],
    context: {
      recurringNeeds: profile.recurringNeeds.map((n) => ({
        need: n.need,
        count: n.count,
        crossSubject: n.crossSubject,
        status: n.status,
      })),
      strategiesThatWork: profile.strategiesThatWork.map((s) => ({
        strategy: s.strategy,
        successRate: s.successRate,
        n: s.n,
        subjects: s.subjects,
      })),
      strategiesThatDidnt: profile.strategiesThatDidnt.map((s) => ({ strategy: s.strategy, n: s.n })),
      confidenceTrend: profile.confidenceTrend,
      // Recent notes are pedagogical signal only — the Broker excludes any
      // safeguarding content before the model sees them.
      recentNotes: opts.recentNotes ?? [],
    },
  };

  try {
    const res = await broker.request<{ summary?: string; standingAdaptations?: Array<Partial<StandingAdaptation>> }>(
      req,
      WHAT_WORKS_NARRATIVE_SCHEMA,
    );
    const summary = typeof res.data.summary === 'string' && res.data.summary.trim()
      ? res.data.summary.trim()
      : fallback.summary;
    const standing =
      Array.isArray(res.data.standingAdaptations) && res.data.standingAdaptations.length > 0
        ? res.data.standingAdaptations.slice(0, 4).map((a, i) => ({
            strategy: String(a.strategy ?? fallback.standingAdaptations[i]?.strategy ?? 'targeted support'),
            basedOn: String(a.basedOn ?? 'based on this pupil’s recent outcomes'),
            confidence:
              typeof a.confidence === 'number' ? Math.max(0, Math.min(100, a.confidence)) : 60,
            subject: String(a.subject ?? 'All subjects'),
            source: 'broker' as const,
          }))
        : fallback.standingAdaptations;
    return { summary, standingAdaptations: standing, source: 'broker' };
  } catch (e) {
    if (e instanceof AIBrokerRefusal) return fallback;
    throw e;
  }
}
