/**
 * Adaptation engine — generates structured {@link AdaptationCard}s for a
 * lesson + class (Phase 5).
 *
 * TWO paths, ONE shape:
 *   - `generateAdaptationsRules` — the DETERMINISTIC, dependency-free DEFAULT.
 *     Works with NO model keys: it reads recent feedback + the objective +
 *     SEND/EAL/FSM flags and proposes sensible cards via fixed rules. This is
 *     the offline-safe path and the testable core.
 *   - `generateAdaptationsBroker` — when a model IS available (env.AI), it
 *     routes the SAME context through the AIBroker for richer wording, and
 *     returns the SAME `AdaptationCard[]` shape. Falls back to the rules path
 *     on any Broker refusal (AI off, over budget, no model, schema invalid).
 *
 * Both flow through an `adaptation.generated` workspace event so the cards land
 * in the school's append-only log and are projected like any other state.
 *
 * RULES LAYER (enforced on EVERY card, both paths):
 *   - Teacher-OWNED: cards start `reviewState: 'suggested'`; never auto-applied.
 *   - NO deficit/diagnosis labels — `assertNoDeficitLanguage` strips/blocks them.
 *   - NO automated decisions — a card proposes ONE practical move, never an action.
 */
import {
  AIBrokerRefusal,
  type AdaptationCard,
  type AIBroker,
  type AIRequest,
  type JsonSchema,
  type Sensitivity,
} from '@shippie/cloudlet-contract';
import type { FeedbackRow, PupilRow, LessonRow } from './workspace-store';

/** The minimum-relevant context the engine reasons over (also the model input). */
export interface AdaptationContext {
  instanceId: string;
  lesson: Pick<LessonRow, 'id' | 'subjectId' | 'objective' | 'topic' | 'time'>;
  pupils: Array<Pick<PupilRow, 'id' | 'name' | 'send' | 'eal' | 'fsm'>>;
  /** Most-recent feedback for this lesson's pupils (state + optional note). */
  feedback: Array<Pick<FeedbackRow, 'pupilId' | 'state' | 'note' | 'supportStrategy'>>;
}

/**
 * Deficit/diagnosis terms that must NEVER appear in a teacher-facing card.
 * Phase-0 mandate: no deficit labels, no diagnosis, teacher-owned language.
 */
const DEFICIT_TERMS = [
  'low ability',
  'weak',
  'poor',
  'struggler',
  'slow learner',
  'behind',
  'deficient',
  'disordered',
  'disorder',
  'dyslexic',
  'dyslexia',
  'adhd',
  'autistic',
  'asd',
  'sen pupil',
  'disabled',
  'incapable',
  'unable',
  'failing',
  'problem child',
];

/**
 * Throw if a card carries deficit/diagnosis language. Used as a hard gate over
 * BOTH the rules output and the model output so the model can never smuggle a
 * label past the contract.
 */
export function assertNoDeficitLanguage(card: AdaptationCard): void {
  const haystack = `${card.need} ${card.strategy} ${card.teacherAction} ${card.whyThis}`.toLowerCase();
  for (const term of DEFICIT_TERMS) {
    // word-ish boundary so "weak" doesn't trip on "weaker understanding"? we
    // keep it strict — any occurrence blocks. Better to over-block here.
    if (haystack.includes(term)) {
      throw new Error(`adaptation card uses deficit language: "${term}"`);
    }
  }
}

const STATE_NEEDS_REVISIT = new Set(['needs_revisit', 'nearly_there']);

let cardSeq = 0;
function nextId(prefix: string, seed: () => number): string {
  return `${prefix}-${seed()}-${(cardSeq += 1)}`;
}

/**
 * Deterministic rules generator. No I/O, no model, no randomness (a `seed`
 * clock is injected for stable ids). Produces 0..N cards:
 *   1. A "needs revisit" group card for pupils who didn't get it / nearly got
 *      it last time on this objective (the core feedback→adaptation loop).
 *   2. An EAL vocabulary pre-teach card if any EAL pupils need revisiting.
 *   3. A SEND scaffolding card if any SEND pupils need revisiting.
 * Cards are teacher-language only and start `reviewState: 'suggested'`.
 */
export function generateAdaptationsRules(
  ctx: AdaptationContext,
  seed: () => number = () => Date.now(),
): AdaptationCard[] {
  cardSeq = 0;
  const byId = new Map(ctx.pupils.map((p) => [p.id, p]));
  const fbByPupil = new Map(ctx.feedback.map((f) => [f.pupilId, f]));
  const date = new Date(seed()).toISOString().slice(0, 10);

  // Pupils who need this objective revisited (didn't / nearly).
  const needRevisit = ctx.pupils.filter((p) => {
    const fb = fbByPupil.get(p.id);
    return fb && STATE_NEEDS_REVISIT.has(fb.state);
  });

  const cards: AdaptationCard[] = [];
  const evidence = (ids: string[]): AdaptationCard['evidence'] =>
    ids
      .map((id) => fbByPupil.get(id))
      .filter((f): f is NonNullable<typeof f> => Boolean(f))
      .map(() => ({ lessonId: ctx.lesson.id, date, note: 'feedback this lesson' }));

  const confidenceFor = (n: number): AdaptationCard['confidence'] =>
    n >= 3 ? 'established' : 'emerging';

  if (needRevisit.length > 0) {
    const ids = needRevisit.map((p) => p.id);
    cards.push(
      assertOk({
        id: nextId('card', seed),
        instanceId: ctx.instanceId,
        target: { kind: 'group', ids, label: `${ids.length} pupil${ids.length > 1 ? 's' : ''}` },
        objective: ctx.lesson.objective,
        need: `revisit "${ctx.lesson.objective}" — not yet secure last lesson`,
        strategy: 'short focused recap before new content',
        teacherAction: `Start with a 5-minute recap of ${ctx.lesson.topic} for this group, then check with a quick example before moving on.`,
        whyThis: 'these pupils marked "needs revisit" or "nearly there" last lesson',
        evidence: evidence(ids),
        confidence: confidenceFor(needRevisit.length),
        reviewState: 'suggested',
        source: 'rules',
        schemaVersion: 1,
      }),
    );
  }

  const ealRevisit = needRevisit.filter((p) => byId.get(p.id)?.eal);
  if (ealRevisit.length > 0) {
    const ids = ealRevisit.map((p) => p.id);
    cards.push(
      assertOk({
        id: nextId('card', seed),
        instanceId: ctx.instanceId,
        target: { kind: 'group', ids, label: `${ids.length} EAL pupil${ids.length > 1 ? 's' : ''}` },
        objective: ctx.lesson.objective,
        need: 'key vocabulary may be a barrier to accessing this objective',
        strategy: 'pre-teach the key words with visuals',
        teacherAction: `Pre-teach the key vocabulary for ${ctx.lesson.topic} with a picture or gesture, and let them rehearse it in a sentence first.`,
        whyThis: 'language access often unlocks the maths/idea once the words are secure',
        evidence: evidence(ids),
        confidence: confidenceFor(ealRevisit.length),
        reviewState: 'suggested',
        source: 'rules',
        schemaVersion: 1,
      }),
    );
  }

  const sendRevisit = needRevisit.filter((p) => byId.get(p.id)?.send);
  if (sendRevisit.length > 0) {
    const ids = sendRevisit.map((p) => p.id);
    cards.push(
      assertOk({
        id: nextId('card', seed),
        instanceId: ctx.instanceId,
        target: { kind: 'group', ids, label: `${ids.length} pupil${ids.length > 1 ? 's' : ''} with extra support` },
        objective: ctx.lesson.objective,
        need: 'a smaller step and a concrete scaffold would help access this',
        strategy: 'break the task into one step with a worked model',
        teacherAction: `Give this group a single-step version with a worked example to copy first, then fade the support as they gain confidence.`,
        whyThis: 'a concrete scaffold lowers the entry point without lowering the objective',
        evidence: evidence(ids),
        confidence: confidenceFor(sendRevisit.length),
        reviewState: 'suggested',
        source: 'rules',
        schemaVersion: 1,
      }),
    );
  }

  return cards;
}

/** Enforce the rules layer on a card before it leaves the engine. */
function assertOk(card: AdaptationCard): AdaptationCard {
  assertNoDeficitLanguage(card);
  if (card.reviewState !== 'suggested') {
    throw new Error('generated cards must start as "suggested" (teacher-owned)');
  }
  return card;
}

/** JSON schema the Broker validates the model's adaptation output against. */
export const ADAPTATION_OUTPUT_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['cards'],
  properties: { cards: { type: 'array' } },
};

/**
 * Broker path. Routes the SAME context through the governed AIBroker for
 * richer wording. Returns the SAME `AdaptationCard[]`. On ANY Broker refusal
 * (AI off / over budget / no model / schema invalid) it FALLS BACK to the
 * deterministic rules path — so the product never blocks on AI. Every model
 * card is still run through `assertOk` (no deficit language, teacher-owned).
 */
export async function generateAdaptationsBroker(
  broker: AIBroker,
  ctx: AdaptationContext,
  opts: { userId: string; appId?: string; sensitivity?: Sensitivity; seed?: () => number } = {
    userId: 'system',
  },
): Promise<{ cards: AdaptationCard[]; source: 'broker' | 'rules' }> {
  const seed = opts.seed ?? (() => Date.now());
  const req: AIRequest = {
    appId: opts.appId ?? 'uniti',
    instanceId: ctx.instanceId,
    userId: opts.userId,
    purpose: 'adaptation.generate',
    sensitivity: opts.sensitivity ?? 'pseudonymised',
    inputRefs: ctx.pupils.map((p) => ({ kind: 'pupil', id: p.id })),
    context: {
      objective: ctx.lesson.objective,
      topic: ctx.lesson.topic,
      subject: ctx.lesson.subjectId,
      pupils: ctx.pupils.map((p) => ({
        id: p.id,
        name: p.name,
        send: !!p.send,
        eal: !!p.eal,
        fsm: !!p.fsm,
      })),
      feedback: ctx.feedback.map((f) => ({
        pupilId: f.pupilId,
        state: f.state,
        note: f.note,
        support: f.supportStrategy,
      })),
    },
  };

  try {
    const res = await broker.request<{ cards: Partial<AdaptationCard>[] }>(
      req,
      ADAPTATION_OUTPUT_SCHEMA,
    );
    const cards = (res.data.cards ?? []).map((raw) =>
      assertOk(normaliseModelCard(raw, ctx, seed)),
    );
    // If the model returned nothing useful, fall back to rules.
    if (cards.length === 0) return { cards: generateAdaptationsRules(ctx, seed), source: 'rules' };
    return { cards, source: 'broker' };
  } catch (e) {
    if (e instanceof AIBrokerRefusal) {
      // AI off / over budget / no model — the offline-safe default.
      return { cards: generateAdaptationsRules(ctx, seed), source: 'rules' };
    }
    throw e;
  }
}

/** Coerce a loose model card into a complete, governed AdaptationCard. */
function normaliseModelCard(
  raw: Partial<AdaptationCard>,
  ctx: AdaptationContext,
  seed: () => number,
): AdaptationCard {
  const ids = Array.isArray(raw.target?.ids) ? raw.target!.ids : ctx.pupils.map((p) => p.id);
  return {
    id: nextId('card', seed),
    instanceId: ctx.instanceId,
    target: {
      kind: raw.target?.kind ?? 'group',
      ids,
      label: raw.target?.label ?? `${ids.length} pupils`,
    },
    objective: raw.objective ?? ctx.lesson.objective,
    need: raw.need ?? 'revisit this objective',
    strategy: raw.strategy ?? 'targeted support',
    teacherAction: raw.teacherAction ?? 'Revisit with a short recap.',
    whyThis: raw.whyThis ?? 'based on recent class feedback',
    evidence: Array.isArray(raw.evidence) ? raw.evidence : [],
    confidence: raw.confidence === 'established' ? 'established' : 'emerging',
    reviewState: 'suggested', // ALWAYS teacher-owned, never trust the model here
    source: 'broker',
    schemaVersion: 1,
  };
}

/**
 * Build the `adaptation.generated` workspace event carrying the cards. Flows
 * through the SAME append-only log (OfflineSync) as feedback + outcomes, so
 * generated cards are projected and synced like any other state.
 */
export function adaptationGeneratedEvent(input: {
  clientEventId: string;
  instanceId: string;
  actorUserId: string;
  deviceId?: string;
  cards: AdaptationCard[];
  source: 'rules' | 'broker';
  /** Lesson + subject the cards belong to — folded onto each card for the
   * read-model projection (the contract AdaptationCard is subject-agnostic). */
  lessonId: string | null;
  subjectId: string;
  createdOfflineAt?: string;
}) {
  return {
    clientEventId: input.clientEventId,
    type: 'adaptation.generated' as const,
    instanceId: input.instanceId,
    actorUserId: input.actorUserId,
    deviceId: input.deviceId ?? 'web',
    createdOfflineAt: input.createdOfflineAt ?? new Date().toISOString(),
    schemaVersion: 1,
    payload: {
      source: input.source,
      cards: input.cards.map((c) => ({
        ...c,
        lessonId: input.lessonId,
        subjectId: input.subjectId,
      })),
    },
  };
}
