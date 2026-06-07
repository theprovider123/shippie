/**
 * Leadership rollups (Phase 8) — the cohort/whole-school version of "What Works".
 *
 * The generic, REUSABLE primitive: given a school's append-only event log + a
 * roster (with vulnerable-group flags) + lesson metadata, compute DETERMINISTIC,
 * evidence-linked aggregates a leader / SENCO can read calmly:
 *   - progress by subject + objective (English split into Reading/Writing/SPaG
 *     strands and ROLLED UP to an "English" headline with drill-down),
 *   - pupils needing a revisit,
 *   - adaptations used most,
 *   - strategies with the strongest outcomes across groups (cohort What Works),
 *   - an inclusion view — outcomes broken by SEND / EAL / FSM,
 *   - adaptation impact — did flagged strategies improve outcomes.
 *
 * This module is PURE (no I/O, no AI, no Cloudflare primitives) and lives in the
 * reusable contract package, Node-unit-tested with a fake event list — exactly
 * like `computePupilWhatWorks`. The same evidence; rolled up, never re-claimed.
 *
 * HONESTY GUARD (Phase-0 / Phase-8 mandate): every metric here is derived from
 * LESSON FEEDBACK, not assessment. The shape is named and labelled
 * "feedback-based" / "lesson feedback evidence" throughout — NEVER "attainment"
 * or "statutory". `EVIDENCE_BASIS` is the single source of truth for that copy.
 * No deficit / diagnosis language about any child or group.
 */
import type { WorkspaceEvent } from './events';

/** The single source of truth for the honesty-guard wording. Bake into copy. */
export const EVIDENCE_BASIS = 'lesson feedback evidence' as const;
export const EVIDENCE_DISCLAIMER =
  'Based on day-to-day lesson feedback, not formal assessment or attainment data.' as const;

/** Feedback states mapped to a 0–100 "secure" score (same scale as the prototype). */
export const FEEDBACK_SCORE: Record<string, number | null> = {
  got_it: 100,
  support_worked: 80,
  nearly_there: 60,
  support_not_worked: 30,
  support_didnt: 30,
  needs_revisit: 20,
  absent: null, // absent never counts toward an average
};

/** States that mean an objective is not yet secure for a pupil. */
const NEEDS_REVISIT_STATES = new Set(['needs_revisit', 'nearly_there']);
/** Outcomes that count as a flagged strategy having worked. */
const WORKED_OUTCOMES = new Set(['worked', 'partly', 'surprised']);

export type VulnerableGroup = 'SEND' | 'EAL' | 'FSM';

/** A roster entry (active or tombstoned). Group flags drive the inclusion view. */
export interface RosterPupil {
  id: string;
  send: boolean;
  eal: boolean;
  fsm: boolean;
  /** false = leaver / tombstoned. Kept for HISTORIC evidence, excluded from
   * "current cohort" views when `activeOnly` is set. */
  active: boolean;
}

/** Lesson metadata — resolves a feedback/card event to a subject + objective. */
export interface RollupLessonMeta {
  id: string;
  date: string;
  subjectId: string;
  objective: string;
}

/** Subject taxonomy — `parentId` models English → Reading/Writing/SPaG. */
export interface RollupSubject {
  id: string;
  name: string;
  parentId: string | null;
  color: string;
}

export interface RollupInput {
  instanceId: string;
  events: WorkspaceEvent[];
  subjects: RollupSubject[];
  lessons: Record<string, RollupLessonMeta>;
  roster: RosterPupil[];
  /** When true, exclude tombstoned (leaver) pupils — the CURRENT cohort view.
   * When false, include them — HISTORIC evidence (e.g. an EHCP/inspection pack). */
  activeOnly?: boolean;
  /** Min feedback data-points before a metric is shown (avoid noise). Default 3. */
  minDataPoints?: number;
  now?: () => number;
}

// ── Output shapes ──────────────────────────────────────────────────────────

/** A single subject's (or strand's) feedback-based progress. */
export interface SubjectProgress {
  subjectId: string;
  name: string;
  color: string;
  /** Average "secure" score 0–100, or null when below the data threshold. */
  pct: number | null;
  /** Number of (non-absent) feedback data-points behind `pct`. */
  dataPoints: number;
  /** Distinct objectives observed in this subject/strand. */
  objectives: ObjectiveProgress[];
}

/** A parent subject with its strands rolled up (English → Reading/Writing/SPaG). */
export interface SubjectHeadline extends SubjectProgress {
  /** Child strands (empty for leaf subjects). The headline `pct` is the
   * data-point-weighted roll-up of own + strand feedback. */
  strands: SubjectProgress[];
}

export interface ObjectiveProgress {
  objective: string;
  subjectId: string;
  pct: number | null;
  dataPoints: number;
  /** Distinct pupils whose latest feedback on this objective is not-secure. */
  needRevisitCount: number;
}

export interface PupilToRevisit {
  pupilId: string;
  /** Objectives where this pupil's LATEST feedback is not yet secure. */
  objectives: Array<{ objective: string; subjectId: string; lastState: string; lastSeen: string }>;
  /** Whether the pupil is a leaver (only present when historic evidence is on). */
  active: boolean;
}

export interface AdaptationUsed {
  /** The teaching move / strategy. */
  strategy: string;
  /** Times this strategy was put in front of a class (generated cards). */
  timesUsed: number;
  /** Distinct subjects it was used in. */
  subjects: string[];
}

/** A strategy's measured outcome across the cohort — the cohort "What Works". */
export interface CohortStrategyOutcome {
  strategy: string;
  /** 0..1 — share of recorded outcomes that worked (or partly). */
  successRate: number;
  /** Number of recorded outcomes. */
  n: number;
  subjects: string[];
  /** Per vulnerable-group success rate (where there's enough signal). */
  byGroup: Partial<Record<VulnerableGroup | 'all', { successRate: number; n: number }>>;
}

/** Outcomes broken down by vulnerable group — the inclusion view. */
export interface InclusionRow {
  group: VulnerableGroup | 'all';
  label: string;
  pupils: number;
  /** Feedback-based average secure score, or null below the threshold. */
  pct: number | null;
  dataPoints: number;
  /** Share of data-points in the not-yet-secure band. */
  needSupportPct: number | null;
}

/** Did flagged adaptations move the needle? Compares the same pupil+objective
 * BEFORE the strategy was flagged vs AFTER. Feedback-based only. */
export interface AdaptationImpact {
  /** Pupil+objective pairs where a flagged strategy was recorded as an outcome. */
  flaggedCount: number;
  /** Of those, how many had their next feedback on that objective improve. */
  improvedCount: number;
  /** improvedCount / flaggedCount (null when nothing flagged). */
  improvedRate: number | null;
  /** Average change in secure-score after a flagged strategy (null if none). */
  avgScoreDelta: number | null;
}

export interface LeadershipRollup {
  instanceId: string;
  /** Honesty guard — surfaced in the UI + export verbatim. */
  evidenceBasis: typeof EVIDENCE_BASIS;
  disclaimer: typeof EVIDENCE_DISCLAIMER;
  /** Whether tombstoned pupils were included (historic evidence). */
  includesHistoric: boolean;
  /** Subjects with English (and any parent) rolled up over its strands. */
  subjects: SubjectHeadline[];
  pupilsToRevisit: PupilToRevisit[];
  adaptationsUsed: AdaptationUsed[];
  topStrategies: CohortStrategyOutcome[];
  inclusion: InclusionRow[];
  adaptationImpact: AdaptationImpact;
  /** Totals for the header. */
  totals: { pupils: number; lessons: number; feedbackPoints: number; subjects: number };
  computedAt: string;
}

interface GeneratedCard {
  id: string;
  strategy?: string;
  objective?: string;
  lessonId?: string | null;
  subjectId?: string;
  targetIds: string[];
}

/**
 * Compute the deterministic leadership rollup. Pure: same input → same output.
 */
export function computeLeadershipRollup(input: RollupInput): LeadershipRollup {
  const now = input.now ?? (() => Date.now());
  const minData = input.minDataPoints ?? 3;
  const lessons = input.lessons;
  const lessonMeta = (id: string | null | undefined): RollupLessonMeta | null =>
    id ? lessons[id] ?? null : null;

  // Roster scope: current cohort (active) vs incl. historic (tombstoned).
  const includedPupils = input.activeOnly
    ? input.roster.filter((p) => p.active)
    : input.roster;
  const includedIds = new Set(includedPupils.map((p) => p.id));
  const groupsOf = new Map<string, VulnerableGroup[]>(
    input.roster.map((p) => [
      p.id,
      [p.send && 'SEND', p.eal && 'EAL', p.fsm && 'FSM'].filter(Boolean) as VulnerableGroup[],
    ]),
  );
  const activeOf = new Map(input.roster.map((p) => [p.id, p.active]));

  const avg = (xs: number[]): number | null =>
    xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;

  // 1. Index generated cards so outcome events resolve to a strategy + targets.
  const cardsById = new Map<string, GeneratedCard>();
  for (const e of input.events) {
    if (e.type !== 'adaptation.generated') continue;
    const cards = ((e.payload as { cards?: unknown[] })?.cards ?? []) as Array<Record<string, unknown>>;
    for (const c of cards) {
      const target = (c.target ?? {}) as { ids?: unknown };
      cardsById.set(String(c.id), {
        id: String(c.id),
        strategy: typeof c.strategy === 'string' ? c.strategy : undefined,
        objective: typeof c.objective === 'string' ? c.objective : undefined,
        lessonId: (c.lessonId as string) ?? null,
        subjectId: (c.subjectId as string) ?? undefined,
        targetIds: Array.isArray(target.ids) ? (target.ids as string[]).map(String) : [],
      });
    }
  }

  // 2. Walk feedback once: per-subject + per-objective scores; latest state per
  //    (pupil, objective) for pupils-to-revisit; per-group scores for inclusion.
  interface SubjAgg {
    scores: number[];
    objectives: Map<string, { scores: number[]; revisit: Set<string> }>;
  }
  const subjAgg = new Map<string, SubjAgg>();
  const groupScores: Record<VulnerableGroup | 'all', number[]> = {
    all: [],
    SEND: [],
    EAL: [],
    FSM: [],
  };
  const groupNeed: Record<VulnerableGroup | 'all', { need: number; total: number }> = {
    all: { need: 0, total: 0 },
    SEND: { need: 0, total: 0 },
    EAL: { need: 0, total: 0 },
    FSM: { need: 0, total: 0 },
  };
  // latest feedback per (pupil|objective) → for pupils-to-revisit + impact.
  interface LatestFb { state: string; lastSeen: string; subjectId: string; secure: boolean; score: number | null }
  const latestByPupilObjective = new Map<string, LatestFb>();
  // full chronological score series per (pupil|objective) for adaptation impact.
  const seriesByPupilObjective = new Map<string, Array<{ date: string; score: number | null }>>();
  const lessonsTouched = new Set<string>();
  let feedbackPoints = 0;

  for (const e of input.events) {
    if (e.type !== 'feedback.created') continue;
    const p = (e.payload ?? {}) as Record<string, unknown>;
    const pupilId = String(p.pupilId);
    if (!includedIds.has(pupilId)) continue;
    const meta = lessonMeta(p.lessonId as string);
    if (!meta) continue;
    lessonsTouched.add(meta.id);
    const state = String(p.state ?? '');
    const score = FEEDBACK_SCORE[state];

    // subject + objective progress (score-bearing states only)
    if (score !== null && score !== undefined) {
      feedbackPoints += 1;
      const agg: SubjAgg = subjAgg.get(meta.subjectId) ?? { scores: [], objectives: new Map() };
      agg.scores.push(score);
      const obj = agg.objectives.get(meta.objective) ?? { scores: [], revisit: new Set<string>() };
      obj.scores.push(score);
      agg.objectives.set(meta.objective, obj);
      subjAgg.set(meta.subjectId, agg);

      // inclusion (score-bearing only)
      groupScores.all.push(score);
      groupNeed.all.total += 1;
      if (NEEDS_REVISIT_STATES.has(state)) groupNeed.all.need += 1;
      for (const g of groupsOf.get(pupilId) ?? []) {
        groupScores[g].push(score);
        groupNeed[g].total += 1;
        if (NEEDS_REVISIT_STATES.has(state)) groupNeed[g].need += 1;
      }
    }

    // latest state per (pupil, objective) — for revisit + objective need counts
    const key = `${pupilId}|${meta.objective}`;
    const existing = latestByPupilObjective.get(key);
    if (!existing || meta.date >= existing.lastSeen) {
      latestByPupilObjective.set(key, {
        state,
        lastSeen: meta.date,
        subjectId: meta.subjectId,
        secure: state === 'got_it',
        score: score ?? null,
      });
    }
    const series = seriesByPupilObjective.get(key) ?? [];
    series.push({ date: meta.date, score: score ?? null });
    seriesByPupilObjective.set(key, series);
  }

  // objective-level need-revisit counts from the latest-state map.
  for (const [key, fb] of latestByPupilObjective) {
    if (!NEEDS_REVISIT_STATES.has(fb.state)) continue;
    const objective = key.slice(key.indexOf('|') + 1);
    const agg = subjAgg.get(fb.subjectId);
    const obj = agg?.objectives.get(objective);
    if (obj) obj.revisit.add(key);
  }

  // 3. Subject headlines — strands roll up to parents (English split).
  const byId = new Map(input.subjects.map((s) => [s.id, s]));
  const parents = input.subjects.filter((s) => s.parentId === null);
  const toSubjectProgress = (s: RollupSubject): SubjectProgress => {
    const agg = subjAgg.get(s.id);
    const objectives: ObjectiveProgress[] = agg
      ? [...agg.objectives.entries()]
          .map(([objective, o]) => ({
            objective,
            subjectId: s.id,
            pct: avg(o.scores),
            dataPoints: o.scores.length,
            needRevisitCount: o.revisit.size,
          }))
          .sort((a, b) => b.needRevisitCount - a.needRevisitCount || (a.pct ?? 0) - (b.pct ?? 0))
      : [];
    const dataPoints = agg?.scores.length ?? 0;
    return {
      subjectId: s.id,
      name: s.name,
      color: s.color,
      pct: dataPoints >= minData ? avg(agg!.scores) : null,
      dataPoints,
      objectives,
    };
  };

  const subjectHeadlines: SubjectHeadline[] = parents.map((parent) => {
    const strands = input.subjects.filter((s) => s.parentId === parent.id);
    const strandProgress = strands.map(toSubjectProgress);
    // Roll-up: parent's own feedback + every strand's feedback, weighted by data.
    const ownScores = subjAgg.get(parent.id)?.scores ?? [];
    const strandScores = strands.flatMap((s) => subjAgg.get(s.id)?.scores ?? []);
    const allScores = [...ownScores, ...strandScores];
    const ownObjectives = toSubjectProgress(parent).objectives;
    const allObjectives = [
      ...ownObjectives,
      ...strandProgress.flatMap((sp) => sp.objectives),
    ].sort((a, b) => b.needRevisitCount - a.needRevisitCount || (a.pct ?? 0) - (b.pct ?? 0));
    return {
      subjectId: parent.id,
      name: parent.name,
      color: parent.color,
      pct: allScores.length >= minData ? avg(allScores) : null,
      dataPoints: allScores.length,
      objectives: allObjectives,
      strands: strandProgress,
    };
  });

  // 4. Pupils to revisit — group the latest not-secure objectives per pupil.
  const revisitByPupil = new Map<string, PupilToRevisit['objectives']>();
  for (const [key, fb] of latestByPupilObjective) {
    if (!NEEDS_REVISIT_STATES.has(fb.state)) continue;
    const pupilId = key.slice(0, key.indexOf('|'));
    const objective = key.slice(key.indexOf('|') + 1);
    const list = revisitByPupil.get(pupilId) ?? [];
    list.push({ objective, subjectId: fb.subjectId, lastState: fb.state, lastSeen: fb.lastSeen });
    revisitByPupil.set(pupilId, list);
  }
  const pupilsToRevisit: PupilToRevisit[] = [...revisitByPupil.entries()]
    .map(([pupilId, objectives]) => ({
      pupilId,
      objectives: objectives.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)),
      active: activeOf.get(pupilId) ?? true,
    }))
    .sort((a, b) => b.objectives.length - a.objectives.length || a.pupilId.localeCompare(b.pupilId));

  // 5. Adaptations used (from generated cards) + per-strategy outcomes.
  interface UsedAgg { timesUsed: number; subjects: Set<string> }
  const usedAgg = new Map<string, UsedAgg>();
  for (const card of cardsById.values()) {
    if (!card.strategy) continue;
    // only count cards that targeted an included pupil (scope to cohort)
    if (card.targetIds.length && !card.targetIds.some((id) => includedIds.has(id))) continue;
    const u = usedAgg.get(card.strategy) ?? { timesUsed: 0, subjects: new Set<string>() };
    u.timesUsed += 1;
    const subj = card.subjectId ?? lessonMeta(card.lessonId)?.subjectId;
    if (subj) u.subjects.add(subj);
    usedAgg.set(card.strategy, u);
  }
  const adaptationsUsed: AdaptationUsed[] = [...usedAgg.entries()]
    .map(([strategy, u]) => ({ strategy, timesUsed: u.timesUsed, subjects: [...u.subjects].sort() }))
    .sort((a, b) => b.timesUsed - a.timesUsed || a.strategy.localeCompare(b.strategy));

  // 6. Cohort strategy outcomes (the cohort "What Works") + per-group breakdown.
  interface StratAgg {
    worked: number;
    total: number;
    subjects: Set<string>;
    byGroup: Record<VulnerableGroup | 'all', { worked: number; total: number }>;
  }
  const stratAgg = new Map<string, StratAgg>();
  const blankGroups = (): StratAgg['byGroup'] => ({
    all: { worked: 0, total: 0 },
    SEND: { worked: 0, total: 0 },
    EAL: { worked: 0, total: 0 },
    FSM: { worked: 0, total: 0 },
  });
  for (const e of input.events) {
    if (e.type !== 'adaptation.outcome_recorded') continue;
    const p = (e.payload ?? {}) as Record<string, unknown>;
    const card = cardsById.get(String(p.cardId));
    if (!card?.strategy) continue;
    const targets = card.targetIds.filter((id) => includedIds.has(id));
    if (card.targetIds.length && targets.length === 0) continue;
    const worked = WORKED_OUTCOMES.has(String(p.outcome));
    const agg = stratAgg.get(card.strategy) ?? {
      worked: 0,
      total: 0,
      subjects: new Set<string>(),
      byGroup: blankGroups(),
    };
    agg.total += 1;
    if (worked) agg.worked += 1;
    const subj = card.subjectId ?? lessonMeta(card.lessonId)?.subjectId;
    if (subj) agg.subjects.add(subj);
    agg.byGroup.all.total += 1;
    if (worked) agg.byGroup.all.worked += 1;
    // attribute to each vulnerable group represented among the targeted pupils
    const repGroups = new Set<VulnerableGroup>();
    for (const id of targets) for (const g of groupsOf.get(id) ?? []) repGroups.add(g);
    for (const g of repGroups) {
      agg.byGroup[g].total += 1;
      if (worked) agg.byGroup[g].worked += 1;
    }
    stratAgg.set(card.strategy, agg);
  }
  const topStrategies: CohortStrategyOutcome[] = [...stratAgg.entries()]
    .filter(([, a]) => a.total >= Math.min(minData, 1) && a.total >= 2)
    .map(([strategy, a]) => {
      const byGroup: CohortStrategyOutcome['byGroup'] = {};
      for (const g of ['all', 'SEND', 'EAL', 'FSM'] as const) {
        const gv = a.byGroup[g];
        if (gv.total > 0) byGroup[g] = { successRate: gv.worked / gv.total, n: gv.total };
      }
      return {
        strategy,
        successRate: a.worked / a.total,
        n: a.total,
        subjects: [...a.subjects].sort(),
        byGroup,
      };
    })
    .sort((a, b) => b.successRate - a.successRate || b.n - a.n);

  // 7. Inclusion rows.
  const groupLabel: Record<VulnerableGroup | 'all', string> = {
    all: 'All pupils',
    SEND: 'SEND',
    EAL: 'EAL',
    FSM: 'FSM',
  };
  const countPupils = (g: VulnerableGroup | 'all') =>
    g === 'all'
      ? includedPupils.length
      : includedPupils.filter((p) => (g === 'SEND' ? p.send : g === 'EAL' ? p.eal : p.fsm)).length;
  const inclusion: InclusionRow[] = (['all', 'SEND', 'EAL', 'FSM'] as const).map((g) => {
    const scores = groupScores[g];
    const need = groupNeed[g];
    return {
      group: g,
      label: groupLabel[g],
      pupils: countPupils(g),
      pct: scores.length >= minData ? avg(scores) : null,
      dataPoints: scores.length,
      needSupportPct: need.total > 0 ? Math.round((need.need / need.total) * 100) : null,
    };
  });

  // 8. Adaptation impact — for each flagged strategy outcome, did the SAME pupil's
  //    next feedback on that objective improve?
  let flaggedCount = 0;
  let improvedCount = 0;
  const deltas: number[] = [];
  for (const e of input.events) {
    if (e.type !== 'adaptation.outcome_recorded') continue;
    const p = (e.payload ?? {}) as Record<string, unknown>;
    const card = cardsById.get(String(p.cardId));
    if (!card?.objective) continue;
    const cardDate = lessonMeta(card.lessonId)?.date ?? '';
    for (const pupilId of card.targetIds) {
      if (!includedIds.has(pupilId)) continue;
      const series = (seriesByPupilObjective.get(`${pupilId}|${card.objective}`) ?? [])
        .filter((s) => s.score !== null)
        .sort((a, b) => a.date.localeCompare(b.date)) as Array<{ date: string; score: number }>;
      if (series.length < 2 || !cardDate) continue;
      const before = [...series].reverse().find((s) => s.date <= cardDate);
      const after = series.find((s) => s.date > cardDate);
      if (!before || !after) continue;
      flaggedCount += 1;
      const delta = after.score - before.score;
      deltas.push(delta);
      if (delta > 0) improvedCount += 1;
    }
  }
  const adaptationImpact: AdaptationImpact = {
    flaggedCount,
    improvedCount,
    improvedRate: flaggedCount > 0 ? improvedCount / flaggedCount : null,
    avgScoreDelta: deltas.length
      ? Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10) / 10
      : null,
  };

  return {
    instanceId: input.instanceId,
    evidenceBasis: EVIDENCE_BASIS,
    disclaimer: EVIDENCE_DISCLAIMER,
    includesHistoric: !input.activeOnly,
    subjects: subjectHeadlines,
    pupilsToRevisit,
    adaptationsUsed,
    topStrategies,
    inclusion,
    adaptationImpact,
    totals: {
      pupils: includedPupils.length,
      lessons: lessonsTouched.size,
      feedbackPoints,
      subjects: parents.length,
    },
    computedAt: new Date(now()).toISOString(),
  };
}
