export interface PageView {
  /** Path within the app, no origin. */
  path: string;
  /** Wall-clock ms when the view started. */
  ts: number;
  /** ms spent on the page before navigating away (set on navigate-away). */
  durationMs?: number;
  /** Optional brief excerpt of visible content for recall. */
  excerpt?: string;
}

export interface InteractionEvent {
  ts: number;
  /** Coarse target descriptor: 'button#new-recipe', 'a[href="/recipes/123"]', etc. */
  target: string;
  kind: 'click' | 'submit' | 'scroll' | 'invalid';
}

export interface SessionSlice {
  start: number;
  end: number;
  pages: string[];
  primaryAction?: string;
}

export interface PatternsRollup {
  /** Last N=200 page views, normalised. */
  recentViews: number;
  typicalSessions: SessionSlice[];
  frequentPaths: string[][]; // sequences like ['/', '/recipes', '/recipes/:id']
  preferences: {
    mostVisitedPath: string | null;
    averageSessionDurationMs: number;
    peakUsageHour: number | null;
  };
}

export interface TemporalContext {
  timeOfDay: 'early-morning' | 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  /** Median session duration for this time-of-day bucket, in ms. */
  expectedSessionDurationMs: number;
  /** 'short' | 'medium' | 'extended' based on the median. */
  availableTime: 'short' | 'medium' | 'extended';
}

export interface RecallHit {
  path: string;
  viewedAt: number;
  durationMs: number;
  /** Cosine similarity in [-1, 1]. */
  relevance: number;
  /** Truncated content excerpt that was indexed. */
  excerpt: string;
}
