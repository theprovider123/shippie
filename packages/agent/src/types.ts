/**
 * @shippie/agent — local cross-app agent.
 *
 * Phase C1 surface. Pure functions over a snapshot of the user's
 * installed apps + recent rows. The agent runs at the container's
 * origin under the system-permissions tier (A3) so it can read across
 * app namespaces without each iframe app needing to grant access.
 *
 * No cloud, no agent-to-agent. The whole package is local — strategies
 * compute, the container renders, audit log writes to D1 for rate
 * limits + telemetry.
 */

export type AgentUrgency = 'low' | 'medium' | 'high';

export interface InsightTarget {
  /** Slug of the app the insight links into. */
  app: string;
  /** Optional sub-route inside the app. */
  route?: string;
  /** Optional query the app should consume on open. */
  query?: Record<string, string | number | boolean | null>;
}

export interface Insight {
  /** Stable id — a re-detection of the same situation should reuse the same id. */
  id: string;
  /** Strategy that produced the insight (for audit + dedupe). */
  strategy: string;
  urgency: AgentUrgency;
  /** Headline shown on the card. */
  title: string;
  /** Single-sentence supporting body. Keep it short — these stack. */
  body: string;
  /** Where tapping the card lands the user. */
  target: InsightTarget;
  /** Wall-clock ms when this insight expires (e.g. "today" insights). */
  expiresAt?: number;
  /** Wall-clock ms when this insight was generated. */
  generatedAt: number;
}

export interface AgentRow {
  /** App slug whose namespace this row belongs to. */
  appSlug: string;
  /** Logical table name within the app's namespace. */
  table: string;
  /** Free-form row payload — strategies parse what they need. */
  payload: unknown;
  /** Wall-clock ms the row was written. */
  createdAt: number;
}

export interface AgentInstalledApp {
  slug: string;
  name: string;
  /** Categories from the AppProfile, when available. */
  category?: string;
  /** Provided cross-app intents. */
  provides?: readonly string[];
  /** Consumed cross-app intents. */
  consumes?: readonly string[];
}

export interface AgentContext {
  /** Current wall-clock ms. Pure tests inject this. */
  now: number;
  /** Snapshot of installed apps. */
  apps: readonly AgentInstalledApp[];
  /** Snapshot of recent rows across all installed apps. */
  rows: readonly AgentRow[];
  /** Already-shown insights so strategies can dedupe. */
  recentInsightIds?: ReadonlySet<string>;
}

export interface AgentStrategy {
  /** Stable strategy name — used in audit logs and insight ids. */
  name: string;
  /** Compute zero-or-more insights from the context. Pure. */
  evaluate(ctx: AgentContext): readonly Insight[];
}

export interface AgentRunResult {
  /** All insights produced this tick, capped + sorted. */
  insights: readonly Insight[];
  /** Per-strategy breakdown for the audit log. */
  byStrategy: Record<string, number>;
}
