/**
 * POST /api/cloudlet/instances/[slug]/adaptations/generate
 *
 * "What the class needs next" — generate structured AdaptationCards for a
 * lesson and append them to THIS school's workspace via an
 * `adaptation.generated` event.
 *
 * Path selection (Phase 5):
 *   - The DETERMINISTIC RULES path is the default + offline-safe: it needs no
 *     model keys and is what runs whenever AI is OFF for the school, over
 *     budget, or no `env.AI` binding exists.
 *   - The BROKER path runs only when the school has AI ON and `env.AI` is
 *     present; `generateAdaptationsBroker` itself falls back to rules on ANY
 *     Broker refusal, so this route never blocks on AI.
 *
 * RBAC: requires `adaptation:generate` (teacher/specialist). The instance is
 * resolved through the immutable id; cards are appended to that school only.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDrizzleClient } from '$server/db/client';
import { resolveInstanceForUser } from '$server/cloudlet/resolve-instance';
import { recordAudit } from '$server/admin/audit';
import type { WorkspaceStub } from '$server/cloudlet/workspace-stub';
import {
  generateAdaptationsRules,
  generateAdaptationsBroker,
  adaptationGeneratedEvent,
  type AdaptationContext,
} from '$server/cloudlet/adaptation-engine';
import { createAIBroker, modelFromEnv } from '$server/cloudlet/ai-broker';
import type { Role } from '@shippie/cloudlet-contract';

export const POST: RequestHandler = async (event) => {
  const env = event.platform?.env;
  if (!env?.DB || !env?.SCHOOL_WORKSPACE) {
    return json({ error: 'platform bindings unavailable' }, { status: 500 });
  }
  const user = event.locals.user;
  if (!user) return json({ error: 'unauthenticated' }, { status: 401 });

  const db = getDrizzleClient(env.DB);
  const resolved = await resolveInstanceForUser(db, event.params.slug, user, {
    action: 'generate',
    resource: { type: 'adaptation' },
  });
  if (!resolved) return json({ error: 'forbidden' }, { status: 403 });
  const { row, ctx: auth } = resolved;

  let body: { lessonId?: string };
  try {
    body = (await event.request.json()) as { lessonId?: string };
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body.lessonId) return json({ error: 'missing_fields', required: ['lessonId'] }, { status: 400 });

  const did = env.SCHOOL_WORKSPACE.idFromName(`uniti:${row.id}`);
  const stub = env.SCHOOL_WORKSPACE.get(did) as unknown as WorkspaceStub;

  const lesson = await stub.getLesson(body.lessonId);
  if (!lesson) return json({ error: 'lesson_not_found' }, { status: 404 });

  const [pupils, feedback, aiSetting] = await Promise.all([
    stub.listPupilsForClass(lesson.classId),
    stub.listFeedbackForLesson(lesson.id),
    stub.getAiSetting(),
  ]);

  const adCtx: AdaptationContext = {
    instanceId: row.id,
    lesson: {
      id: lesson.id,
      subjectId: lesson.subjectId,
      objective: lesson.objective,
      topic: lesson.topic,
      time: lesson.time,
    },
    pupils: pupils.map((p) => ({ id: p.id, name: p.name, send: p.send, eal: p.eal, fsm: p.fsm })),
    feedback: feedback.map((f) => ({
      pupilId: f.pupilId,
      state: f.state,
      note: f.note,
      supportStrategy: f.supportStrategy,
    })),
  };

  // Choose the path. Broker only when AI is ON for the school AND env.AI
  // exists; otherwise the deterministic rules path. The Broker still
  // re-checks AI/budget/RBAC itself and falls back to rules on refusal.
  let cards;
  let source: 'rules' | 'broker';
  if (aiSetting.aiEnabled && env.AI) {
    const broker = createAIBroker({
      rolesFor: async () => auth.roles as Role[],
      aiEnabled: async () => aiSetting.aiEnabled,
      remainingBudget: async () => Number.POSITIVE_INFINITY, // metering caps land in Phase 6+
      pupilNames: async (_inst, ids) =>
        Object.fromEntries(pupils.filter((p) => ids.includes(p.id)).map((p) => [p.id, p.name])),
      kv: env.CACHE,
      model: modelFromEnv(env),
      meter: async (instanceId, metric, n) => {
        await recordAudit(db, {
          actorUserId: user.id,
          action: 'usage.metered',
          targetTable: `instance:${instanceId}`,
          targetId: metric,
          after: { metric, n },
        });
      },
      audit: async (e) => {
        const r = await recordAudit(db, {
          actorUserId: e.actorUserId,
          action: e.action,
          targetTable: `instance:${e.instanceId}`,
          targetId: null,
          after: { reason: e.reason, ...e.meta },
        });
        return String(r.id);
      },
    });
    const out = await generateAdaptationsBroker(broker, adCtx, {
      userId: user.id,
      sensitivity: aiSetting.sensitivity,
    });
    cards = out.cards;
    source = out.source;
  } else {
    cards = generateAdaptationsRules(adCtx);
    source = 'rules';
  }

  if (cards.length === 0) {
    return json({ cards: [], source, generated: 0 });
  }

  // Append the cards through the SAME append-only log.
  const evt = adaptationGeneratedEvent({
    clientEventId: `gen-${lesson.id}-${Date.now()}`,
    instanceId: row.id,
    actorUserId: user.id,
    deviceId: 'web',
    cards,
    source,
    lessonId: lesson.id,
    subjectId: lesson.subjectId,
  });
  await stub.appendEvent(evt);

  await recordAudit(db, {
    actorUserId: user.id,
    action: 'adaptation.generated',
    targetTable: `instance:${row.id}`,
    targetId: lesson.id,
    after: { source, count: cards.length },
  });

  return json({ cards, source, generated: cards.length }, { status: 201 });
};
