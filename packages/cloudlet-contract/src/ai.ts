/**
 * AIBroker + UsageMetering — the reusable Shippie-Private-Cloud AI surface
 * (Phase 5). ALL model calls in every Shippie private app go through the
 * Broker; no provider key is ever reachable outside it.
 *
 * This module is pure TYPES + small pure helpers (the safeguarding guard and
 * the pseudonymiser) — no Cloudflare primitives, no provider SDKs, no I/O — so
 * it lives in the reusable contract package and is shared by the server
 * implementation and its Node-side tests. The server impl
 * (`lib/server/cloudlet/ai-broker.ts`) wires the injected deps (model fn, KV,
 * clock, audit, metering, settings) around these contracts, mirroring the
 * `WorkspaceStore`/`Outbox` injectable-deps pattern.
 */

/**
 * How identifiable the request's inputs are. Governs redaction/pseudonymisation.
 *  - `group`         — no individual pupils; class/group aggregates only.
 *  - `pseudonymised` — pupils referenced, but identifiers are replaced with
 *                      stable labels (Pupil A/B, Group N) before any model call.
 *  - `identified`    — real identifiers present (most sensitive). The Broker
 *                      ALWAYS pseudonymises before a model call regardless of
 *                      this flag; the flag records the INPUT sensitivity for
 *                      audit + policy, never a licence to send raw PII.
 */
export type Sensitivity = 'group' | 'pseudonymised' | 'identified';

/** What the model is asked to produce — used for routing, caching, audit. */
export interface AIRequest {
  appId: string;
  instanceId: string;
  userId: string;
  /** e.g. 'adaptation.generate' — namespaced purpose, drives policy + cache. */
  purpose: string;
  sensitivity: Sensitivity;
  /** References to workspace data the context builder may include. */
  inputRefs: Array<{ kind: string; id: string }>;
  /** The already-assembled, minimum-relevant context the model will see. The
   * Broker runs the safeguarding guard + pseudonymiser over THIS object. */
  context: unknown;
  modelPolicy?: { tier: 'local' | 'standard' | 'premium'; allowExternal?: boolean };
  budgetPolicy?: { perRequestTokenCap?: number };
}

export interface AIResult<T> {
  data: T;
  model: string;
  cached: boolean;
  tokens: number;
  auditId: string;
}

export interface AIBroker {
  /**
   * The governed pipeline, in order:
   *   RBAC + per-school AI setting + per-school spend budget
   *   → safeguarding guard (exclusion-as-safe-default)
   *   → pseudonymise identifiable pupil data per `sensitivity`
   *   → content-hash cache (KV)
   *   → route to a model (Workers AI binding, else injected provider)
   *   → validate output against `outputSchema`
   *   → audit (recordAudit) + eval-log hook
   *   → typed result.
   * Refuses (throws {@link AIBrokerRefusal}) when AI is disabled, over budget,
   * or the caller lacks the role — and audits the refusal.
   */
  request<T>(req: AIRequest, outputSchema: JsonSchema): Promise<AIResult<T>>;
}

/** A minimal JSON-schema shape the Broker validates model output against. */
export interface JsonSchema {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
  /** When the top-level result is `{ cards: AdaptationCard[] }`. */
  [k: string]: unknown;
}

/** Why a Broker call was refused — every reason is audited. */
export type AIRefusalReason =
  | 'ai_disabled'
  | 'over_budget'
  | 'forbidden'
  | 'no_model'
  | 'schema_invalid';

export class AIBrokerRefusal extends Error {
  constructor(
    public reason: AIRefusalReason,
    message?: string,
  ) {
    super(message ?? reason);
    this.name = 'AIBrokerRefusal';
  }
}

// ── UsageMetering ───────────────────────────────────────────────────────────

export type Metric = 'ai_tokens' | 'storage_bytes' | 'sync_events' | 'active_user';

export interface UsageReport {
  instanceId: string;
  from: string;
  to: string;
  totals: Partial<Record<Metric, number>>;
}

export interface UsageMetering {
  record(instanceId: string, metric: Metric, n: number): Promise<void>;
  usage(instanceId: string, period: { from: string; to: string }): Promise<UsageReport>;
}

// ── Structured adaptation card — the core Uniti domain object ────────────────
//
// NOT free-form AI text. Both the deterministic rules generator and the
// model-backed generator return this SAME shape; it flows through an
// `adaptation.generated` workspace event and is rendered by the teacher app.

export interface AdaptationCard {
  id: string;
  instanceId: string;
  target: { kind: 'pupil' | 'group' | 'class'; ids: string[]; label: string };
  /** Curriculum/scheme objective ref or text. */
  objective: string;
  /** The barrier, in teacher language (NO deficit/diagnosis labels). */
  need: string;
  /** One practical move. */
  strategy: string;
  /** What to do in the room. */
  teacherAction: string;
  /** The reason this is suggested. */
  whyThis: string;
  evidence: Array<{ lessonId: string; date: string; note: string }>;
  confidence: 'emerging' | 'established';
  /** Always starts 'suggested' — the teacher owns acceptance. */
  reviewState: 'suggested' | 'accepted' | 'edited' | 'rejected';
  outcome?: 'worked' | 'partly' | 'did_not_work' | 'surprised';
  /** Provenance: how this card was produced (governance + eval). */
  source: 'rules' | 'broker';
  schemaVersion: number;
}

// ── Safeguarding guard (pure) ───────────────────────────────────────────────
//
// Exclusion is the SAFE DEFAULT — we err broad. Any text that may concern a
// child's welfare, safety, mental health, home circumstances, abuse,
// disclosure, or similar is EXCLUDED from the model call entirely (never
// redacted-and-sent — excluded). The model only ever sees pedagogical signal.

const SAFEGUARDING_PATTERNS: RegExp[] = [
  // welfare / safety / disclosure
  /\b(safeguard\w*|disclos\w*|child\s*protection|cp\s*referral|social\s*(care|services|worker)|cafcass|lado|mash\b|section\s*47)\b/i,
  /\b(abuse|abus\w*|neglect\w*|harm\w*|self[-\s]?harm|suicid\w*|cutting)\b/i,
  /\b(domestic\s*(violence|abuse)|d[\.\s]?v\b)\b/i,
  // home / care circumstances
  /\b(looked[-\s]?after|in\s*care|foster\w*|kinship|young\s*carer|cared[-\s]?for)\b/i,
  /\b(homeless\w*|temporary\s*accommodation|refuge|food\s*bank)\b/i,
  // health / mental health (clinical, not pedagogical)
  /\b(medication|prescri\w*|diagnos\w*|clinic\w*|cahms?\b|camhs\b|therap\w*|counsell\w*|anxiety\s*disorder|depress\w*|trauma\w*|eating\s*disorder)\b/i,
  // family / sensitive personal
  /\b(parent\w*\s*(in\s*prison|imprison\w*|arrest\w*)|bereave\w*|grief|died|death\s*of)\b/i,
];

export interface SafeguardingResult {
  /** True iff the text tripped a safeguarding pattern. */
  flagged: boolean;
  /** Which pattern families matched (for audit; never the matched text). */
  categories: string[];
}

const SAFEGUARDING_CATEGORIES = [
  'welfare',
  'abuse',
  'domestic',
  'care',
  'deprivation',
  'health',
  'family',
];

/**
 * Scan a string for safeguarding signal. Pure. Returns WHICH families matched
 * (for audit) but never echoes the offending text. Errs broad by design.
 */
export function scanForSafeguarding(text: string): SafeguardingResult {
  const categories: string[] = [];
  SAFEGUARDING_PATTERNS.forEach((re, i) => {
    if (re.test(text)) categories.push(SAFEGUARDING_CATEGORIES[i] ?? `c${i}`);
  });
  return { flagged: categories.length > 0, categories };
}

/**
 * Walk an arbitrary context object and EXCLUDE any string field that trips the
 * safeguarding guard (replaced with a neutral marker so the model never sees
 * it). Returns the cleaned context plus a report of what was excluded — by
 * field path + category, never the content. Exclusion, not redaction: the
 * value is removed, not masked-in-place with the sensitive token still nearby.
 */
export interface SafeguardingExclusionReport {
  excluded: Array<{ path: string; categories: string[] }>;
}

export function excludeSafeguarding<T>(
  context: T,
): { clean: T; report: SafeguardingExclusionReport } {
  const excluded: SafeguardingExclusionReport['excluded'] = [];
  const walk = (value: unknown, path: string): unknown => {
    if (typeof value === 'string') {
      const scan = scanForSafeguarding(value);
      if (scan.flagged) {
        excluded.push({ path, categories: scan.categories });
        return '[excluded: safeguarding]';
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((v, i) => walk(v, `${path}[${i}]`));
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = walk(v, path ? `${path}.${k}` : k);
      }
      return out;
    }
    return value;
  };
  const clean = walk(context, '') as T;
  return { clean, report: { excluded } };
}

// ── Pseudonymiser (pure) ────────────────────────────────────────────────────
//
// Replaces identifiable pupil references with STABLE labels (Pupil A, Pupil B,
// Group 1) before any model call. Stable within one request so the model can
// reason about "Pupil A" consistently; the map is kept server-side so the
// Broker can re-expand labels back to real ids in the returned cards.

export interface PseudonymMap {
  /** realId → label (e.g. 'p12' → 'Pupil A'). */
  forward: Record<string, string>;
  /** label → realId (re-expansion of model output). */
  reverse: Record<string, string>;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Build a stable pseudonym map for a set of pupil ids + group ids. */
export function buildPseudonymMap(input: {
  pupilIds?: string[];
  groupIds?: string[];
}): PseudonymMap {
  const forward: Record<string, string> = {};
  const reverse: Record<string, string> = {};
  (input.pupilIds ?? []).forEach((id, i) => {
    const label = `Pupil ${LETTERS[i] ?? `#${i + 1}`}`;
    forward[id] = label;
    reverse[label] = id;
  });
  (input.groupIds ?? []).forEach((id, i) => {
    const label = `Group ${i + 1}`;
    forward[id] = label;
    reverse[label] = id;
  });
  return { forward, reverse };
}

/**
 * Apply a pseudonym map across a context object: every string value has each
 * mapped real-id and pupil display-name occurrence replaced with its label.
 * `names` maps realId → displayName so "Aisha J." also becomes "Pupil A".
 * Pure.
 */
export function pseudonymise<T>(
  context: T,
  map: PseudonymMap,
  names: Record<string, string> = {},
): T {
  const replacements: Array<[string, string]> = [];
  for (const [realId, label] of Object.entries(map.forward)) {
    replacements.push([realId, label]);
    const nm = names[realId];
    if (nm) replacements.push([nm, label]);
  }
  // Longest-first so a name isn't partially clobbered by a shorter id.
  replacements.sort((a, b) => b[0].length - a[0].length);
  const apply = (s: string): string => {
    let out = s;
    for (const [from, to] of replacements) {
      if (!from) continue;
      out = out.split(from).join(to);
    }
    return out;
  };
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return apply(value);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = walk(v);
      return out;
    }
    return value;
  };
  return walk(context) as T;
}

/** Re-expand a label string back to the real id (Broker output rehydration). */
export function expandPseudonym(label: string, map: PseudonymMap): string {
  return map.reverse[label] ?? label;
}

// ── Content-hash cache key (pure) ───────────────────────────────────────────

/**
 * Deterministic cache key for a request: a stable hash over purpose + model
 * tier + the CLEANED+PSEUDONYMISED context. Same governed input → same key →
 * cache hit, so identical lessons don't re-bill the model. Uses a small,
 * dependency-free FNV-1a hash (the cache is a best-effort accelerator, not a
 * security boundary).
 */
export function contentHashKey(parts: {
  appId: string;
  purpose: string;
  tier: string;
  cleanContext: unknown;
}): string {
  const json = stableStringify({
    a: parts.appId,
    p: parts.purpose,
    t: parts.tier,
    c: parts.cleanContext,
  });
  return `ai:${fnv1a(json)}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
