// packages/sdk/src/wrapper/observe/mutation-observer.ts
/**
 * The dispatcher.
 *
 * One MutationObserver per page, scoped to `document.body`. Mutation
 * batches are coalesced into the next animation frame so heavy DOM
 * churn doesn't fan out into N rule invocations.
 *
 * Each rule has a per-call time budget (default 2ms). If a rule blows
 * the budget on `warnAfter` consecutive calls, it gets auto-disabled —
 * this protects the maker's app from a buggy or slow rule shipping in
 * a future wrapper update.
 *
 * Cleanup: when an element is removed from the DOM, any teardown
 * functions registered against it are invoked. We track teardowns in a
 * WeakMap so removed elements are GC'd cleanly.
 */
import type { CompiledSelector } from './selector-engine.ts';
import { compileEnhanceConfig, isEnhanceable } from './selector-engine.ts';
import { getRule, disableRule } from './registry.ts';
import { ruleCanRun } from './capability-gate.ts';
import { DEFAULT_BUDGET, type EnhanceConfig, type RuleBudget } from './types.ts';

export interface ActiveDispatch {
  stop: () => void;
}

export interface DispatcherOptions {
  config: EnhanceConfig;
  /** Budget per rule — overrides for testing. Defaults to DEFAULT_BUDGET. */
  budget?: RuleBudget;
  /** Root to observe. Defaults to document.body. */
  root?: Element;
}

export function startDispatch(opts: DispatcherOptions): ActiveDispatch {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { stop: () => {} };
  }

  const compiled = compileEnhanceConfig(opts.config);
  if (compiled.length === 0) return { stop: () => {} };

  const budget = opts.budget ?? DEFAULT_BUDGET;
  const root = opts.root ?? document.body;
  if (!root) return { stop: () => {} };

  // Track which (element, ruleName) pairs we've already applied, so we
  // don't double-apply when a single mutation reveals an element via
  // multiple paths.
  const applied = new WeakMap<Element, Set<string>>();
  // Per-element teardowns: WeakMap of element → ruleName → cleanup fn.
  const teardowns = new WeakMap<Element, Map<string, () => void>>();
  // Consecutive-over-budget tally per rule, for the auto-disable watchdog.
  const overBudget = new Map<string, number>();

  // Initial pass: apply rules to anything already in the tree.
  scanAndApply(root, compiled, applied, teardowns, overBudget, budget);

  let scheduled = false;
  const pending = new Set<Node>();

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((added) => {
        if (added.nodeType === 1) pending.add(added);
      });
      m.removedNodes.forEach((removed) => {
        if (removed.nodeType === 1) {
          teardownSubtree(removed as Element, teardowns);
        }
      });
      if (m.type === 'attributes' && m.target.nodeType === 1) {
        pending.add(m.target);
      }
    }
    if (pending.size > 0 && !scheduled) {
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        for (const node of pending) {
          if (node.isConnected) {
            scanAndApply(node as Element, compiled, applied, teardowns, overBudget, budget);
          }
        }
        pending.clear();
      });
    }
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
  });

  return {
    stop: () => {
      observer.disconnect();
      pending.clear();
    },
  };
}

function scanAndApply(
  scope: Element,
  compiled: readonly CompiledSelector[],
  applied: WeakMap<Element, Set<string>>,
  teardowns: WeakMap<Element, Map<string, () => void>>,
  overBudget: Map<string, number>,
  budget: RuleBudget,
): void {
  for (const { selector, rules } of compiled) {
    // Match the scope itself + all descendants.
    const matches: Element[] = [];
    if (matchesSafe(scope, selector)) matches.push(scope);
    for (const el of querySafe(scope, selector)) matches.push(el);

    for (const el of matches) {
      if (!isEnhanceable(el)) continue;
      const seenSet = applied.get(el) ?? new Set<string>();
      for (const ruleName of rules) {
        if (seenSet.has(ruleName)) continue;
        const rule = getRule(ruleName);
        if (!rule) continue;
        if (!ruleCanRun(rule.capabilities)) continue;

        const t0 = performance.now();
        let cleanup: void | (() => void);
        try {
          cleanup = rule.apply(el);
        } catch (err) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('shippie:rule-error', {
                detail: { rule: ruleName, error: (err as Error).message },
              }),
            );
          }
          continue;
        }
        const elapsed = performance.now() - t0;
        seenSet.add(ruleName);
        if (cleanup) {
          let map = teardowns.get(el);
          if (!map) {
            map = new Map();
            teardowns.set(el, map);
          }
          map.set(ruleName, cleanup);
        }

        // Watchdog: too many consecutive over-budget calls → disable.
        if (elapsed > budget.maxApplyMs) {
          const n = (overBudget.get(ruleName) ?? 0) + 1;
          overBudget.set(ruleName, n);
          if (n >= budget.warnAfter) {
            disableRule(ruleName, `over budget ${n} times (last ${elapsed.toFixed(2)}ms)`);
            overBudget.delete(ruleName);
          }
        } else {
          overBudget.delete(ruleName);
        }
      }
      applied.set(el, seenSet);
    }
  }
}

function teardownSubtree(
  removed: Element,
  teardowns: WeakMap<Element, Map<string, () => void>>,
): void {
  const map = teardowns.get(removed);
  if (map) {
    for (const cleanup of map.values()) {
      try {
        cleanup();
      } catch {
        // teardown errors are non-fatal
      }
    }
    teardowns.delete(removed);
  }
  // Recurse into descendants — MutationObserver doesn't enumerate them
  // for us when a subtree is removed wholesale.
  if (removed.querySelectorAll) {
    removed.querySelectorAll<Element>('*').forEach((desc) => {
      const m = teardowns.get(desc);
      if (!m) return;
      for (const cleanup of m.values()) {
        try {
          cleanup();
        } catch {
          // no-op
        }
      }
      teardowns.delete(desc);
    });
  }
}

function matchesSafe(el: Element, selector: string): boolean {
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}

function querySafe(scope: Element, selector: string): Element[] {
  try {
    return Array.from(scope.querySelectorAll<Element>(selector));
  } catch {
    return [];
  }
}
