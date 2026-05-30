/**
 * System Assistant — action planner (Tranche 6).
 *
 * The assistant translates user-stated intents into a sequence of
 * bridge messages routed through the intent bus. Every step is
 * traceable in the Trust Ledger (ledger-first invariant).
 *
 * 5A foundation: pure planner + step shape. The assistant surface
 * (drawer, voice, model integration) lives in subsequent patches.
 * Local-first: the default model is the on-device runtime; user-held
 * cloud keys live in Vault.
 */

export type AssistantStepKind =
  | 'intent.provide'
  | 'intent.consume'
  | 'ai.run'
  | 'share.send'
  | 'reminders.set';

export interface AssistantStep {
  kind: AssistantStepKind;
  /** The app slug that ultimately handles or originates this step. */
  appSlug: string;
  /** Human-readable line shown in the user's confirmation sheet. */
  describe: string;
  /** Bridge payload the assistant will dispatch when confirmed. */
  payload: Record<string, unknown>;
  /** Whether this step requires explicit user confirmation. */
  requiresConfirm: boolean;
}

export interface AssistantPlan {
  goal: string;
  steps: AssistantStep[];
  /** Aggregate confirm-ness: true if any step requires confirm. */
  requiresConfirm: boolean;
}

export function buildPlan(goal: string, steps: AssistantStep[]): AssistantPlan {
  return {
    goal,
    steps,
    requiresConfirm: steps.some((s) => s.requiresConfirm),
  };
}

/**
 * Default per-kind confirm-required rule.
 *
 * Read-shaped steps run without confirmation; write-shaped steps and
 * outbound shares require explicit user OK. The planner ignores the
 * assistant's preferences here — these rules are 5A-frozen so a
 * model-driven plan can never silently downgrade the confirm
 * requirement on a write.
 */
export function defaultConfirmRequired(kind: AssistantStepKind): boolean {
  switch (kind) {
    case 'intent.consume':
    case 'ai.run':
      return false;
    case 'intent.provide':
    case 'share.send':
    case 'reminders.set':
      return true;
  }
}

export function buildStep(
  kind: AssistantStepKind,
  appSlug: string,
  describe: string,
  payload: Record<string, unknown>,
  overrides?: { requiresConfirm?: boolean },
): AssistantStep {
  return {
    kind,
    appSlug,
    describe,
    payload,
    requiresConfirm: overrides?.requiresConfirm ?? defaultConfirmRequired(kind),
  };
}

/**
 * Spec-frozen ceiling: a single assistant plan cannot exceed 10
 * steps. Anything longer should be a user-initiated workflow, not an
 * inferred plan.
 */
export const MAX_PLAN_STEPS = 10;

export function validatePlan(plan: AssistantPlan): void {
  if (plan.steps.length === 0) throw new Error('assistant: plan has no steps');
  if (plan.steps.length > MAX_PLAN_STEPS) {
    throw new Error(`assistant: plan has ${plan.steps.length} steps; max is ${MAX_PLAN_STEPS}`);
  }
  for (const step of plan.steps) {
    if (!step.appSlug) throw new Error('assistant: step missing appSlug');
    if (!step.describe) throw new Error('assistant: step missing describe');
  }
}
