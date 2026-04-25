// packages/sdk/src/wrapper/observe/registry.ts
/**
 * Rule registry. Built-in rules register at module load; third-party
 * rules can register via `registerRule`.
 *
 * The registry is intentionally a module-level singleton — the wrapper
 * runtime is one-per-page and rules are addressable by name from
 * shippie.json. A multi-instance design would buy us nothing here.
 */
import type { EnhanceRule } from './types.ts';

const rules = new Map<string, EnhanceRule>();
const disabled = new Set<string>();

export function registerRule(rule: EnhanceRule): void {
  if (rules.has(rule.name)) {
    // Last registration wins; this lets a host app override a built-in.
    // Emit a warning event so accidental name-clashes are visible.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('shippie:rule-overridden', { detail: { name: rule.name } }),
      );
    }
  }
  rules.set(rule.name, rule);
}

export function getRule(name: string): EnhanceRule | undefined {
  if (disabled.has(name)) return undefined;
  return rules.get(name);
}

export function listRules(): readonly EnhanceRule[] {
  return [...rules.values()].filter((r) => !disabled.has(r.name));
}

/**
 * Permanently disable a rule for this page. Used by the perf watchdog
 * when a rule blows its time budget repeatedly. Idempotent.
 */
export function disableRule(name: string, reason: string): void {
  if (disabled.has(name)) return;
  disabled.add(name);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('shippie:rule-disabled', { detail: { name, reason } }),
    );
  }
}

/** Test-only: clear the registry. Not exported from the package index. */
export function _resetForTest(): void {
  rules.clear();
  disabled.clear();
}
