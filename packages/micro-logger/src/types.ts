/**
 * @shippie/micro-logger — config-driven single-tap logger template.
 *
 * Built once. Each "5-config showcase" in P4A is a JSON-shaped object
 * + a 4-line `App.tsx` that calls `createMicroLoggerApp(config)`.
 */

export type ChartKind = 'sparkline' | 'heatmap' | 'count';

export type FieldType = 'string' | 'number' | 'date';

export interface MicroLoggerConfig {
  /** Stable container app id, e.g. `app_caffeine_log`. */
  appId: string;
  /** URL slug. Must match the curated registry + manifest. */
  slug: string;
  /** Human-readable name shown in the header. */
  name: string;
  /** App description shown under the header. */
  description?: string;
  /** Theme accent — used for chart fill, focus rings, button bg. */
  themeColor: string;
  /** The intent broadcast on every log. e.g. `caffeine-logged`. */
  intent: string;
  /** Cross-app intents this app subscribes to (optional). */
  consumes?: readonly string[];
  /** The big tap-to-log button label. */
  buttonLabel: string;
  /** Chart variant rendered above the entry list. */
  chart: ChartKind;
  /**
   * Row schema — describes optional fields the user can fill in
   * BEFORE tapping the button. Most micro-loggers don't need this and
   * leave it empty. The "amount" field on `caffeine-logged` is a
   * common case (1 espresso vs 4).
   */
  rowSchema: Record<string, FieldType>;
  /** Default values applied when a field isn't user-edited. */
  defaults?: Record<string, unknown>;
  /**
   * For chart === 'count', the daily target the count aspires to.
   * (e.g. 8 glasses for hydration.) Ignored by sparkline/heatmap.
   */
  countTarget?: number;
  /**
   * Heatmap windowDays. Default 30. Heatmaps fold rows by day to
   * surface patterns; you usually want a short window.
   */
  heatmapWindowDays?: number;
}

export interface LoggedRow {
  /** Stable id — `r_${ms}_${rand}`. */
  id: string;
  /** Wall-clock ms when the row landed. */
  loggedAt: number;
  /** User-supplied fields per the rowSchema, plus defaults applied. */
  fields: Record<string, unknown>;
}

/**
 * Storage key derivation. We namespace per slug so multiple micro-
 * loggers in the same container don't collide.
 */
export function storageKeyFor(slug: string): string {
  return `shippie.micro-logger.${slug}.v1`;
}
