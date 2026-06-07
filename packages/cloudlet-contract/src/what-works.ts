/**
 * "What Works" — a REUSABLE longitudinal entity profile derived from an
 * append-only event log (Phase 6 — the moat).
 *
 * The generic primitive: given the events that mention an entity (here a pupil)
 * + thresholds, compute deterministic, evidence-linked rolling aggregates —
 *   - recurring needs (frequency + recency + spread, emerging vs established),
 *   - strategies that worked / didn't (success rate from outcome events),
 *   - objectives to revisit,
 *   - a confidence trend.
 * Every surfaced item carries EVIDENCE LINKS (lessonId + date refs) and only
 * appears past a confidence threshold (≥N occurrences across ≥M lessons).
 *
 * This module is PURE (no I/O, no AI, no Cloudflare primitives) so it lives in
 * the reusable contract package and is Node-unit-tested with a fake event list,
 * exactly like `WorkspaceStore`. The deterministic aggregate is ALWAYS available
 * and is the fallback the AI narrative degrades to when AI is off/absent.
 *
 * STRICT RULES (Phase-0 mandate): teacher-owned language, NO deficit/diagnosis
 * labels. A "need" is a barrier in teacher language ("vocabulary not yet
 * secure"), never a label about the child.
 */
import type { WorkspaceEvent } from './events';

/** Derived per-entity profile. Mirrors `PupilWhatWorks` in the master plan. */
export interface PupilWhatWorks {
  pupilId: string;
  instanceId: string;
  recurringNeeds: RecurringNeed[];
  strategiesThatWork: StrategyStat[];
  strategiesThatDidnt: StrategyStat[];
  objectivesToRevisit: ObjectiveToRevisit[];
  confidenceTrend: 'improving' | 'steady' | 'dipping';
  evidenceRefs: EvidenceRef[];
  /** Overall profile confidence: enough signal to be 'established' yet? */
  confidence: 'emerging' | 'established';
  /** How many distinct lessons the whole profile is built from. */
  lessonsObserved: number;
  computedAt: string;
  /** True when there isn't enough real signal and cold-start seeds are shown. */
  coldStart: boolean;
}

export interface EvidenceRef {
  lessonId: string;
  date: string;
}

export interface RecurringNeed {
  need: string;
  count: number;
  lastSeen: string;
  /** Distinct subjects this need showed up in. */
  subjects: string[];
  crossSubject: boolean;
  status: 'emerging' | 'established';
  evidence: EvidenceRef[];
}

export interface StrategyStat {
  strategy: string;
  /** 0..1 — share of recorded outcomes that worked (or partly). */
  successRate: number;
  /** Number of recorded outcomes for this strategy for this pupil. */
  n: number;
  subjects: string[];
  status: 'emerging' | 'established';
  evidence: EvidenceRef[];
}

export interface ObjectiveToRevisit {
  objective: string;
  subjectId: string;
  lastState: string;
  lastSeen: string;
  evidence: EvidenceRef[];
}

/** Confidence thresholds — a pattern only surfaces at ≥N occurrences across
 * ≥M lessons; the SAME pattern crosses to 'established' at the higher bars. */
export interface WhatWorksThresholds {
  /** Min occurrences for a need/strategy to surface at all. */
  minOccurrences: number;
  /** Min distinct lessons for a need/strategy to surface at all. */
  minLessons: number;
  /** Occurrences at/above which a pattern is 'established' (else 'emerging'). */
  establishedOccurrences: number;
  /** Distinct lessons at/above which the whole profile is 'established'. */
  establishedLessons: number;
}

export const DEFAULT_THRESHOLDS: WhatWorksThresholds = {
  minOccurrences: 2,
  minLessons: 2,
  establishedOccurrences: 3,
  establishedLessons: 4,
};

/** Feedback states that signal an objective is not yet secure for a pupil. */
const NEEDS_REVISIT_STATES = new Set(['needs_revisit', 'nearly_there']);
/** Outcomes that count as the strategy having worked. */
const WORKED_OUTCOMES = new Set(['worked', 'partly', 'surprised']);

/**
 * Cold-start: research-backed adaptive-teaching strategies (EEF) shown for a
 * pupil with too little signal, so a new pupil is never empty. Teacher-owned,
 * no deficit language — these are MOVES, not labels.
 */
export const COLD_START_STRATEGIES: ReadonlyArray<{ strategy: string; whyThis: string }> = [
  { strategy: 'Pre-teach key vocabulary before the task', whyThis: 'securing the words first often unlocks the idea' },
  { strategy: 'Show a worked example, then gradually fade the scaffold', whyThis: 'a model lowers the entry point without lowering the objective' },
  { strategy: 'Break a long task into one clear step at a time', whyThis: 'reduces working-memory load so attention stays on the learning' },
  { strategy: 'Pair oral rehearsal before writing', whyThis: 'talking the idea through first makes the writing more secure' },
];

/** The minimum a caller must supply to resolve a lesson to a date + subject. */
export interface LessonMeta {
  id: string;
  date: string;
  subjectId: string;
  objective: string;
}

export interface ComputeInput {
  pupilId: string;
  instanceId: string;
  /** The full append-only event log for the school (filtered internally). */
  events: WorkspaceEvent[];
  /** Lesson id → meta (date/subject/objective) for evidence + spread. */
  lessons: Record<string, LessonMeta>;
  thresholds?: WhatWorksThresholds;
  /** Injected clock for a stable `computedAt` in tests. */
  now?: () => number;
}

interface GeneratedCard {
  id: string;
  strategy?: string;
  need?: string;
  objective?: string;
  lessonId?: string | null;
  subjectId?: string;
  targetIds: string[];
}

/**
 * Compute the deterministic profile. Pure: same events in → same profile out.
 * Walks the log once to build:
 *   - card index (adaptation.generated) so outcome events resolve to a strategy,
 *   - per-pupil feedback history (for recurring needs + objectives + trend),
 *   - per-pupil outcome history (for strategy success rates).
 */
export function computePupilWhatWorks(input: ComputeInput): PupilWhatWorks {
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS;
  const now = input.now ?? (() => Date.now());
  const lessons = input.lessons;
  const lessonMeta = (lessonId: string | null | undefined): LessonMeta | null =>
    lessonId ? lessons[lessonId] ?? null : null;

  // 1. Index generated cards (need a card's strategy + which lesson/subject it
  //    targeted, so outcome_recorded events can be attributed to this pupil).
  const cardsById = new Map<string, GeneratedCard>();
  for (const e of input.events) {
    if (e.type !== 'adaptation.generated') continue;
    const cards = ((e.payload as { cards?: unknown[] })?.cards ?? []) as Array<Record<string, unknown>>;
    for (const c of cards) {
      const target = (c.target ?? {}) as { ids?: unknown };
      cardsById.set(String(c.id), {
        id: String(c.id),
        strategy: typeof c.strategy === 'string' ? c.strategy : undefined,
        need: typeof c.need === 'string' ? c.need : undefined,
        objective: typeof c.objective === 'string' ? c.objective : undefined,
        lessonId: (c.lessonId as string) ?? null,
        subjectId: (c.subjectId as string) ?? undefined,
        targetIds: Array.isArray(target.ids) ? (target.ids as string[]).map(String) : [],
      });
    }
  }

  const lessonsTouched = new Set<string>();
  const evidenceRefs: EvidenceRef[] = [];
  const seenEvidence = new Set<string>();
  const addEvidence = (lessonId: string | null | undefined) => {
    const meta = lessonMeta(lessonId);
    if (!meta) return;
    lessonsTouched.add(meta.id);
    const key = meta.id;
    if (!seenEvidence.has(key)) {
      seenEvidence.add(key);
      evidenceRefs.push({ lessonId: meta.id, date: meta.date });
    }
  };

  // 2. Recurring needs + objectives-to-revisit + trend — from this pupil's
  //    feedback, joined to lessons for subject spread + dates.
  interface NeedAgg {
    need: string;
    subjects: Set<string>;
    evidence: EvidenceRef[];
    lessons: Set<string>;
    lastSeen: string;
  }
  const needAggs = new Map<string, NeedAgg>();
  const objectiveAggs = new Map<string, ObjectiveToRevisit>();
  // chronological "not secure" series for the trend (1 = secure, 0 = not).
  const trendSeries: Array<{ at: string; secure: boolean }> = [];

  for (const e of input.events) {
    if (e.type !== 'feedback.created') continue;
    const p = (e.payload ?? {}) as Record<string, unknown>;
    if (String(p.pupilId) !== input.pupilId) continue;
    const meta = lessonMeta(p.lessonId as string);
    if (!meta) continue;
    addEvidence(meta.id);
    const state = String(p.state ?? '');
    const secure = state === 'got_it';
    trendSeries.push({ at: meta.date, secure });

    if (NEEDS_REVISIT_STATES.has(state)) {
      // A recurring NEED keyed on the objective (teacher language, no labels):
      // "X not yet secure". A note may name a more specific barrier.
      const needText = `${meta.objective} — not yet secure`;
      const agg = needAggs.get(needText) ?? {
        need: needText,
        subjects: new Set<string>(),
        evidence: [],
        lessons: new Set<string>(),
        lastSeen: meta.date,
      };
      agg.subjects.add(meta.subjectId);
      agg.lessons.add(meta.id);
      if (!agg.evidence.some((ev) => ev.lessonId === meta.id))
        agg.evidence.push({ lessonId: meta.id, date: meta.date });
      if (meta.date >= agg.lastSeen) agg.lastSeen = meta.date;
      needAggs.set(needText, agg);

      // objective-to-revisit: keep the LATEST not-secure state per objective.
      const existing = objectiveAggs.get(meta.objective);
      if (!existing || meta.date >= existing.lastSeen) {
        objectiveAggs.set(meta.objective, {
          objective: meta.objective,
          subjectId: meta.subjectId,
          lastState: state,
          lastSeen: meta.date,
          evidence: [
            ...(existing?.evidence ?? []).filter((ev) => ev.lessonId !== meta.id),
            { lessonId: meta.id, date: meta.date },
          ],
        });
      }
    } else if (secure) {
      // A secured objective is no longer "to revisit".
      objectiveAggs.delete(meta.objective);
    }
  }

  // 3. Strategy success rates — from this pupil's outcome events resolved back
  //    to the generated card's strategy.
  interface StratAgg {
    strategy: string;
    worked: number;
    total: number;
    subjects: Set<string>;
    evidence: EvidenceRef[];
    lessons: Set<string>;
  }
  const stratAggs = new Map<string, StratAgg>();
  for (const e of input.events) {
    if (e.type !== 'adaptation.outcome_recorded') continue;
    const p = (e.payload ?? {}) as Record<string, unknown>;
    const card = cardsById.get(String(p.cardId));
    if (!card || !card.strategy) continue;
    if (!card.targetIds.includes(input.pupilId)) continue;
    const meta = lessonMeta(card.lessonId);
    const strategy = card.strategy;
    const agg = stratAggs.get(strategy) ?? {
      strategy,
      worked: 0,
      total: 0,
      subjects: new Set<string>(),
      evidence: [],
      lessons: new Set<string>(),
    };
    agg.total += 1;
    if (WORKED_OUTCOMES.has(String(p.outcome))) agg.worked += 1;
    if (meta) {
      agg.subjects.add(meta.subjectId);
      agg.lessons.add(meta.id);
      if (!agg.evidence.some((ev) => ev.lessonId === meta.id))
        agg.evidence.push({ lessonId: meta.id, date: meta.date });
      addEvidence(meta.id);
    } else if (card.subjectId) {
      agg.subjects.add(card.subjectId);
    }
    stratAggs.set(strategy, agg);
  }

  // 4. Apply thresholds + map to the public shape.
  const passes = (occurrences: number, lessonCount: number) =>
    occurrences >= thresholds.minOccurrences && lessonCount >= thresholds.minLessons;
  const statusFor = (occurrences: number): 'emerging' | 'established' =>
    occurrences >= thresholds.establishedOccurrences ? 'established' : 'emerging';

  const recurringNeeds: RecurringNeed[] = [...needAggs.values()]
    .filter((a) => passes(a.lessons.size, a.lessons.size))
    .map((a) => ({
      need: a.need,
      count: a.lessons.size,
      lastSeen: a.lastSeen,
      subjects: [...a.subjects].sort(),
      crossSubject: a.subjects.size > 1,
      status: statusFor(a.lessons.size),
      evidence: a.evidence.sort((x, y) => x.date.localeCompare(y.date)),
    }))
    .sort((x, y) => y.count - x.count || y.lastSeen.localeCompare(x.lastSeen));

  const allStrategies = [...stratAggs.values()];
  const toStat = (a: StratAgg): StrategyStat => ({
    strategy: a.strategy,
    successRate: a.total > 0 ? a.worked / a.total : 0,
    n: a.total,
    subjects: [...a.subjects].sort(),
    status: statusFor(a.total),
    evidence: a.evidence.sort((x, y) => x.date.localeCompare(y.date)),
  });
  const surfacedStrategies = allStrategies.filter((a) => passes(a.total, a.lessons.size || a.total));
  const strategiesThatWork = surfacedStrategies
    .filter((a) => a.worked / a.total >= 0.5)
    .map(toStat)
    .sort((x, y) => y.successRate - x.successRate || y.n - x.n);
  const strategiesThatDidnt = surfacedStrategies
    .filter((a) => a.worked / a.total < 0.5)
    .map(toStat)
    .sort((x, y) => x.successRate - y.successRate);

  const objectivesToRevisit = [...objectiveAggs.values()].sort((x, y) =>
    y.lastSeen.localeCompare(x.lastSeen),
  );

  const lessonsObserved = lessonsTouched.size;
  const coldStart = lessonsObserved < thresholds.minLessons;
  const confidence: 'emerging' | 'established' =
    lessonsObserved >= thresholds.establishedLessons ? 'established' : 'emerging';

  return {
    pupilId: input.pupilId,
    instanceId: input.instanceId,
    recurringNeeds,
    strategiesThatWork,
    strategiesThatDidnt,
    objectivesToRevisit,
    confidenceTrend: computeTrend(trendSeries),
    evidenceRefs: evidenceRefs.sort((x, y) => x.date.localeCompare(y.date)),
    confidence,
    lessonsObserved,
    computedAt: new Date(now()).toISOString(),
    coldStart,
  };
}

/**
 * Confidence trend from the chronological secure/not-secure series: compare the
 * secure-rate of the earlier half to the later half. Needs ≥2 points; below
 * that it's 'steady' (not enough signal to claim a direction).
 */
function computeTrend(
  series: Array<{ at: string; secure: boolean }>,
): 'improving' | 'steady' | 'dipping' {
  if (series.length < 2) return 'steady';
  const sorted = [...series].sort((a, b) => a.at.localeCompare(b.at));
  const mid = Math.floor(sorted.length / 2);
  const rate = (arr: typeof sorted) =>
    arr.length === 0 ? 0 : arr.filter((s) => s.secure).length / arr.length;
  const early = rate(sorted.slice(0, mid));
  const late = rate(sorted.slice(mid));
  const delta = late - early;
  if (delta >= 0.2) return 'improving';
  if (delta <= -0.2) return 'dipping';
  return 'steady';
}
