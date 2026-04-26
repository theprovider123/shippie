/**
 * Ambient orchestrator.
 *
 * `runOnce` is the single entry point that walks every configured
 * collection, fetches a 30-day window of rows via the caller-supplied
 * `readCollection`, and dispatches each enabled analyser:
 *  - Sync analysers (or AI-backed ones with the right helpers in `ctx`)
 *    run inline; their insights are persisted via `appendInsight`.
 *  - AI-backed analysers without the matching helper (`embed` for the
 *    generic case; `sentiment` specifically for `sentiment-trend`) are
 *    queued via `enqueueAnalysis` so the document side can drain them
 *    once an open tab can reach the AI bridge.
 *
 * Failures inside a single analyser are logged but do not abort the
 * sweep — the next analyser still gets to run.
 *
 * Returns counters useful for tests + the wrapper telemetry surface:
 * how many analysers ran, how many were queued, and how many insights
 * were appended.
 */
import { appendInsight } from './insight-store.ts';
import { enqueueAnalysis } from './queue.ts';
import type { AmbientConfig, Analyser, AnalyserContext } from './types.ts';

const WINDOW_MS = 30 * 24 * 3600 * 1000;

export interface RunOnceResult {
  ranAnalysers: number;
  queuedAnalysers: number;
  insightsAppended: number;
}

export interface RunOnceOpts {
  config: AmbientConfig;
  analysers: Analyser[];
  readCollection(name: string, sinceMs: number): Promise<Record<string, unknown>[]>;
  embed?: AnalyserContext['embed'];
  sentiment?: AnalyserContext['sentiment'];
  now: number;
}

export async function runOnce(opts: RunOnceOpts): Promise<RunOnceResult> {
  const result: RunOnceResult = {
    ranAnalysers: 0,
    queuedAnalysers: 0,
    insightsAppended: 0,
  };
  if (!opts.config.enabled) return result;

  const enabledIds = new Set(opts.config.analysers);
  const enabled = opts.analysers.filter((a) => enabledIds.has(a.id));

  for (const collection of opts.config.collections) {
    const data = await opts.readCollection(collection, opts.now - WINDOW_MS);
    if (data.length < 5) continue;

    for (const a of enabled) {
      // sentiment-trend is special: it only needs `sentiment`, not a generic
      // embedder. Every other AI-backed analyser requires `embed`. If the
      // matching helper isn't available, queue and move on.
      const needsSentiment = a.id === 'sentiment-trend';
      const missingHelper = needsSentiment ? !opts.sentiment : !opts.embed;
      if (a.syncable === false && missingHelper) {
        try {
          await enqueueAnalysis({
            analyserId: a.id,
            collection,
            cursorTs: opts.now,
            enqueuedAt: opts.now,
          });
          result.queuedAnalysers += 1;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[ambient] failed to enqueue analyser', a.id, err);
        }
        continue;
      }

      try {
        const insights = await a.run({
          collection,
          data,
          now: opts.now,
          embed: opts.embed,
          sentiment: opts.sentiment,
        });
        for (const insight of insights) {
          await appendInsight(insight);
        }
        result.ranAnalysers += 1;
        result.insightsAppended += insights.length;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[ambient] analyser failed', a.id, err);
      }
    }
  }

  return result;
}
