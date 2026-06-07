/**
 * AIBroker — the governed gateway every Shippie private-app AI call passes
 * through (Phase 5, the crown jewel). NO provider key is reachable outside
 * this module.
 *
 * The pipeline, in strict order (contract: AIBroker.request):
 *   1. RBAC          — the caller's roles must grant the purpose's action.
 *   2. AI setting    — the school's per-instance AI ON/OFF (from setup).
 *   3. Budget        — per-school spend budget via UsageMetering.
 *   4. Safeguarding  — exclude (NOT redact) any safeguarding signal. Safe
 *                      default: anything that MIGHT concern a child's welfare
 *                      is removed from the model input entirely.
 *   5. Pseudonymise  — replace identifiable pupil data (Pupil A/B, Group N)
 *                      per the request `sensitivity`.
 *   6. Cache         — content-hash KV cache over the CLEANED context.
 *   7. Route         — Workers AI binding if present, else an injected
 *                      provider; ABSENCE never crashes (caller falls back to
 *                      the rules path).
 *   8. Validate      — output validated against the JSON schema.
 *   9. Audit + eval  — recordAudit every call (incl. refusals) + eval-log
 *                      hook for acceptance/edit signals.
 *
 * Everything that decides, redacts, pseudonymises or caches is pure and lives
 * behind INJECTED deps (model fn, kv, clock, audit, metering, settings) — the
 * same WorkspaceStore/Outbox seam — so the core is Node-unit-testable with no
 * Cloudflare runtime. `createBrokerFromEnv` does the real wiring.
 */
import {
  AIBrokerRefusal,
  buildPseudonymMap,
  contentHashKey,
  excludeSafeguarding,
  pseudonymise,
  type AIBroker,
  type AIRequest,
  type AIResult,
  type AIRefusalReason,
  type JsonSchema,
  type Metric,
  type Role,
} from '@shippie/cloudlet-contract';
import { roleCan } from '@shippie/cloudlet-contract';

/** A minimal async KV the cache uses. Browser/Worker binds env.CACHE. */
export interface BrokerKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

/** What a routed model returns: parsed JSON + a token count for metering. */
export interface ModelResponse {
  output: unknown;
  tokens: number;
  model: string;
}

/** A model function. The Broker passes the cleaned+pseudonymised context +
 * the output schema; the impl owns the provider call. Returning `null` means
 * "no model available" → the Broker refuses with `no_model`. */
export type ModelFn = (input: {
  purpose: string;
  schema: JsonSchema;
  context: unknown;
  tier: string;
}) => Promise<ModelResponse | null>;

/** Records eval signal (cached/fresh, token cost, later: accept/edit verdict). */
export type EvalLogger = (e: {
  instanceId: string;
  purpose: string;
  auditId: string;
  cached: boolean;
  tokens: number;
  model: string;
  safeguardingExcluded: number;
}) => Promise<void>;

export interface BrokerDeps {
  /** The caller's roles in this instance (RBAC input). */
  rolesFor: (instanceId: string, userId: string) => Promise<Role[]>;
  /** The school's AI ON/OFF setting (false → refuse `ai_disabled`). */
  aiEnabled: (instanceId: string) => Promise<boolean>;
  /** Remaining AI-token budget for the instance this period (Infinity = unmetered). */
  remainingBudget: (instanceId: string) => Promise<number>;
  /** Re-expandable pupil id → display-name lookup for pseudonymisation. */
  pupilNames: (instanceId: string, ids: string[]) => Promise<Record<string, string>>;
  kv: BrokerKv;
  model: ModelFn;
  /** UsageMetering.record bound to the instance. */
  meter: (instanceId: string, metric: Metric, n: number) => Promise<void>;
  /** recordAudit — returns the new entry's id. */
  audit: (e: {
    actorUserId: string;
    instanceId: string;
    action: string;
    reason?: string;
    meta?: Record<string, unknown>;
  }) => Promise<string>;
  evalLog?: EvalLogger;
  now?: () => number;
  /** Cache TTL seconds (default 7 days). */
  cacheTtlSeconds?: number;
}

/** Map a purpose like 'adaptation.generate' to an RBAC (resourceType, action). */
function rbacForPurpose(purpose: string): { type: string; action: string } {
  const [type, action] = purpose.split('.');
  return { type: type || 'ai', action: action || 'generate' };
}

/**
 * Minimal JSON-schema validation: top-level type=object + required keys present.
 * The cache/model output is trusted-ish (our own model), so this is a guard
 * against a malformed/empty response, not a full validator.
 */
function validateAgainstSchema(value: unknown, schema: JsonSchema): boolean {
  if (schema.type !== 'object') return value !== null && value !== undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  for (const key of schema.required ?? []) {
    if (!(key in (value as Record<string, unknown>))) return false;
  }
  return true;
}

export function createAIBroker(deps: BrokerDeps): AIBroker {
  const now = deps.now ?? (() => Date.now());
  const ttl = deps.cacheTtlSeconds ?? 60 * 60 * 24 * 7;

  async function refuse(req: AIRequest, reason: AIRefusalReason): Promise<never> {
    await deps.audit({
      actorUserId: req.userId,
      instanceId: req.instanceId,
      action: 'ai.refused',
      reason,
      meta: { purpose: req.purpose },
    });
    throw new AIBrokerRefusal(reason);
  }

  return {
    async request<T>(req: AIRequest, outputSchema: JsonSchema): Promise<AIResult<T>> {
      // 1. RBAC
      const roles = await deps.rolesFor(req.instanceId, req.userId);
      const { type, action } = rbacForPurpose(req.purpose);
      if (!roleCan(roles, action, { type })) {
        return refuse(req, 'forbidden');
      }

      // 2. Per-school AI setting
      if (!(await deps.aiEnabled(req.instanceId))) {
        return refuse(req, 'ai_disabled');
      }

      // 3. Budget
      const remaining = await deps.remainingBudget(req.instanceId);
      const cap = req.budgetPolicy?.perRequestTokenCap ?? 0;
      if (remaining <= 0 || (cap > 0 && remaining < cap)) {
        return refuse(req, 'over_budget');
      }

      // 4. Safeguarding guard — EXCLUDE (not redact) before anything else.
      const { clean: safeContext, report } = excludeSafeguarding(req.context);

      // 5. Pseudonymise identifiable pupil data per sensitivity. `group` never
      //    names pupils; otherwise build a stable Pupil A/B map and re-expand
      //    the labels in the model output afterwards.
      const pupilIds = req.inputRefs.filter((r) => r.kind === 'pupil').map((r) => r.id);
      const groupIds = req.inputRefs.filter((r) => r.kind === 'group').map((r) => r.id);
      const map = buildPseudonymMap({ pupilIds, groupIds });
      const names =
        req.sensitivity === 'group' ? {} : await deps.pupilNames(req.instanceId, pupilIds);
      const modelContext =
        req.sensitivity === 'group'
          ? safeContext
          : pseudonymise(safeContext, map, names);

      const tier = req.modelPolicy?.tier ?? 'standard';

      // 6. Content-hash cache (over the cleaned+pseudonymised context).
      const cacheKey = contentHashKey({
        appId: req.appId,
        purpose: req.purpose,
        tier,
        cleanContext: modelContext,
      });
      const cachedRaw = await deps.kv.get(cacheKey);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw) as { output: unknown; model: string };
        const rehydrated = rehydrate(parsed.output, map);
        const auditId = await deps.audit({
          actorUserId: req.userId,
          instanceId: req.instanceId,
          action: 'ai.request',
          meta: { purpose: req.purpose, cached: true, model: parsed.model, tokens: 0 },
        });
        await deps.evalLog?.({
          instanceId: req.instanceId,
          purpose: req.purpose,
          auditId,
          cached: true,
          tokens: 0,
          model: parsed.model,
          safeguardingExcluded: report.excluded.length,
        });
        return { data: rehydrated as T, model: parsed.model, cached: true, tokens: 0, auditId };
      }

      // 7. Route to a model. Absence → no_model refusal (caller uses rules).
      const resp = await deps.model({ purpose: req.purpose, schema: outputSchema, context: modelContext, tier });
      if (!resp) {
        return refuse(req, 'no_model');
      }

      // 8. Validate output against the schema.
      if (!validateAgainstSchema(resp.output, outputSchema)) {
        return refuse(req, 'schema_invalid');
      }

      // Cache the PSEUDONYMISED output (labels, not real ids) so the cache
      // never stores re-identified data; re-expand on read.
      await deps.kv.put(cacheKey, JSON.stringify({ output: resp.output, model: resp.model }), {
        expirationTtl: ttl,
      });

      // 9. Meter + audit + eval-log.
      await deps.meter(req.instanceId, 'ai_tokens', resp.tokens);
      const auditId = await deps.audit({
        actorUserId: req.userId,
        instanceId: req.instanceId,
        action: 'ai.request',
        meta: {
          purpose: req.purpose,
          cached: false,
          model: resp.model,
          tokens: resp.tokens,
          safeguardingExcluded: report.excluded.length,
          sensitivity: req.sensitivity,
          at: now(),
        },
      });
      await deps.evalLog?.({
        instanceId: req.instanceId,
        purpose: req.purpose,
        auditId,
        cached: false,
        tokens: resp.tokens,
        model: resp.model,
        safeguardingExcluded: report.excluded.length,
      });

      const rehydrated = rehydrate(resp.output, map);
      return {
        data: rehydrated as T,
        model: resp.model,
        cached: false,
        tokens: resp.tokens,
        auditId,
      };
    },
  };
}

/** Re-expand pseudonym labels (Pupil A) back to real ids across model output. */
function rehydrate(output: unknown, map: { reverse: Record<string, string> }): unknown {
  const labels = Object.keys(map.reverse).sort((a, b) => b.length - a.length);
  if (labels.length === 0) return output;
  const apply = (s: string): string => {
    let out = s;
    for (const label of labels) out = out.split(label).join(map.reverse[label] ?? label);
    return out;
  };
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return apply(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = walk(val);
      return o;
    }
    return v;
  };
  return walk(output);
}

// ── Real wiring (gates on env presence) ─────────────────────────────────────

export interface BrokerEnv {
  AI?: { run: (model: string, input: unknown) => Promise<unknown> };
  CACHE: BrokerKv;
}

/**
 * Build a model fn from the env. If `env.AI` (Workers AI binding) is absent the
 * fn returns `null` (→ the Broker refuses `no_model`, and the caller uses the
 * deterministic rules path). When present it calls Workers AI and best-effort
 * parses JSON from the response.
 */
export function modelFromEnv(env: BrokerEnv): ModelFn {
  return async ({ purpose, context, schema }) => {
    if (!env.AI) return null; // gate on presence — never crash
    const model = '@cf/meta/llama-3.1-8b-instruct';
    const prompt =
      `You are a UK primary-teaching adaptation assistant. Using ONLY the ` +
      `pedagogical context below, return STRICT JSON matching this schema: ` +
      `${JSON.stringify(schema)}. Use teacher-owned language; NO deficit or ` +
      `diagnosis labels; propose practical classroom moves, never decisions. ` +
      `Purpose: ${purpose}. Context: ${JSON.stringify(context)}`;
    const raw = (await env.AI.run(model, {
      messages: [{ role: 'user', content: prompt }],
    })) as { response?: string } | string;
    const text = typeof raw === 'string' ? raw : (raw.response ?? '');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    let output: unknown;
    try {
      output = JSON.parse(match[0]);
    } catch {
      return null;
    }
    // Rough token estimate (Workers AI llama responses don't always meter).
    const tokens = Math.ceil((prompt.length + text.length) / 4);
    return { output, tokens, model };
  };
}
