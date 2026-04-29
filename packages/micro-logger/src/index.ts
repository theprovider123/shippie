/**
 * @shippie/micro-logger — public API.
 *
 * The factory returns a React component the showcase ships verbatim.
 * Everything else is exported so a maker can drop in a custom chart
 * or hook into the storage layer without forking the template.
 */
export { createMicroLoggerApp } from './MicroLoggerApp.tsx';
export { Sparkline, CountChart, Heatmap } from './charts.tsx';
export {
  bucketByDay,
  countToday,
  dayKey,
  heatmapMatrix,
  type DayBucket,
  type HeatmapCell,
} from './aggregate.ts';
export {
  appendRow,
  loadRows,
  saveRows,
} from './storage.ts';
export {
  storageKeyFor,
  type ChartKind,
  type FieldType,
  type LoggedRow,
  type MicroLoggerConfig,
} from './types.ts';
export type { ChartProps } from './charts.tsx';
