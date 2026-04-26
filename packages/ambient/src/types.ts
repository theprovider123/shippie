export type InsightUrgency = 'low' | 'medium' | 'high';

export interface Insight {
  id: string;
  collection: string;          // e.g. 'entries' for journal
  generatedAt: number;
  urgency: InsightUrgency;
  title: string;
  summary: string;
  /** Optional path the user can tap to investigate. */
  href?: string;
  /** True when shown to the user; render only false ones. */
  shown?: boolean;
  /** True when dismissed; never re-render. */
  dismissed?: boolean;
}

export interface AmbientConfig {
  enabled: boolean;
  /** ms between scheduled runs. PBS approximates this; fallback uses
   *  visibilitychange. */
  intervalMs: number;
  /** Which collections to inspect. */
  collections: string[];
  /** Which analysers to run. */
  analysers: AnalyserId[];
}

export type AnalyserId = 'trend' | 'anomaly' | 'sentiment-trend' | 'topic-cluster';

/** Result of a sentiment classification call from the AI bridge. */
export interface SentimentResult {
  sentiment: 'positive' | 'neutral' | 'negative';
  /** Optional confidence/intensity in [0, 1]. Analysers may ignore. */
  score: number;
}

export interface AnalyserContext {
  collection: string;
  data: ReadonlyArray<Record<string, unknown>>;
  now: number;
  /**
   * Optional embedder injected by the orchestrator when an open AI tab is
   * reachable. Used by AI-backed analysers (e.g. topic-cluster). When absent
   * the orchestrator should queue the analysis instead of running it.
   */
  embed?: (text: string) => Promise<{ embedding: number[] }>;
  /**
   * Optional sentiment classifier injected alongside `embed` when an AI tab
   * is reachable. Used by `sentiment-trend`. The bridge maps free text to a
   * coarse polarity plus a [0,1] confidence/intensity score. Kept separate
   * from `embed` so analysers don't have to derive sentiment from cosine
   * distance to a reference vector.
   */
  sentiment?: (text: string) => Promise<SentimentResult>;
}

export interface Analyser {
  id: AnalyserId;
  /** True when this analyser can run without an open tab (no AI). */
  syncable: boolean;
  run(ctx: AnalyserContext): Promise<Insight[]>;
}

export const DEFAULT_AMBIENT_CONFIG: AmbientConfig = {
  enabled: false,                       // opt-in
  intervalMs: 24 * 60 * 60 * 1000,
  collections: [],
  analysers: ['trend', 'anomaly'],      // sync-only by default
};
