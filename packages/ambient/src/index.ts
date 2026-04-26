export type * from './types.ts';

// Runtime façade — the wrapper drains the queue and surfaces undismissed
// insights on app open. Showcase apps with their own bootstrap import the
// orchestrator + analysers directly to wire them to their own data.
export {
  appendInsight,
  listUndismissed,
  markShown,
  dismiss,
} from './insight-store.ts';
export { drainQueue, enqueueAnalysis, type QueuedAnalysis } from './queue.ts';
export { runOnce, type RunOnceResult, type RunOnceOpts } from './orchestrator.ts';
export { registerScheduler } from './scheduler.ts';

// Built-in analysers. Apps import only the ones they want and pass them
// in `runOnce({analysers: [...]})`. Keeps unused-analyser code tree-shaken.
export { trendAnalyser } from './analysers/trend.ts';
export { anomalyAnalyser } from './analysers/anomaly.ts';
export { sentimentTrendAnalyser } from './analysers/sentiment-trend.ts';
export { topicClusterAnalyser } from './analysers/topic-cluster.ts';
