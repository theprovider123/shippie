// packages/sdk/src/wrapper/observe/types.ts
/**
 * Shared types for the wrapper's DOM observation runtime.
 *
 * The observer is the keystone of Shippie's "wrapper-as-extension" model:
 * makers declare CSS selectors → behaviour names in shippie.json, the
 * wrapper compiles those into MutationObserver targets, and rules apply
 * automatically as elements appear in the DOM.
 */

/**
 * A capability the rule needs from the runtime. The capability gate
 * checks these before applying a rule; missing capabilities silently
 * skip the rule (per the "no Best on Android badging" positioning).
 */
export type Capability =
  | 'wakelock' // Screen Wake Lock API
  | 'share-target' // Web Share Target (PWA-installed Android Chrome)
  | 'haptics' // navigator.vibrate (Android only — iOS no-ops gracefully)
  | 'barcode' // Barcode Detection API
  | 'broadcast-channel'; // BroadcastChannel API

/**
 * A rule attaches behaviour to elements that match a selector. The
 * `apply` function runs once per matched element, returning a cleanup
 * function that runs when the element leaves the DOM (or when the
 * registry tears down).
 */
export interface EnhanceRule {
  /** Stable name; appears in shippie.json values and in error logs. */
  name: string;
  /** Required browser capabilities; rule is skipped if any are missing. */
  capabilities: readonly Capability[];
  /**
   * Apply behaviour to a single matched element. Return a teardown
   * function or void if the rule has no per-element teardown.
   */
  apply: (el: Element) => void | (() => void);
}

/**
 * Compiled enhance config. Maps a CSS selector to the names of rules
 * that should apply to elements matching it.
 *
 * Source: `shippie.json` `enhance:` block, e.g.
 *   { "video[autoplay], canvas[data-shippie-canvas]": ["wakelock"] }
 */
export type EnhanceConfig = Record<string, readonly string[]>;

/**
 * Per-rule perf budget. If a rule's `apply` function exceeds the budget
 * across N consecutive dispatches, the registry auto-disables it and
 * emits a `shippie:rule-disabled` event so makers can investigate.
 */
export interface RuleBudget {
  /** Hard time budget per call. Default 2ms. */
  maxApplyMs: number;
  /** How many consecutive over-budget calls before auto-disable. Default 3. */
  warnAfter: number;
}

export const DEFAULT_BUDGET: RuleBudget = {
  maxApplyMs: 2,
  warnAfter: 3,
};
