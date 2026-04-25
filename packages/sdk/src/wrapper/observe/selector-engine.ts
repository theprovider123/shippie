// packages/sdk/src/wrapper/observe/selector-engine.ts
/**
 * Compiles a shippie.json `enhance:` config into the target list the
 * MutationObserver dispatcher iterates over.
 *
 * Input shape:
 *   {
 *     "video[autoplay], canvas[data-shippie-canvas]": ["wakelock"],
 *     "ul[data-shippie-list]": ["swipe-actions", "haptic-scroll"]
 *   }
 *
 * Output shape:
 *   [
 *     { selector: "video[autoplay], canvas[data-shippie-canvas]", rules: ["wakelock"] },
 *     { selector: "ul[data-shippie-list]", rules: ["swipe-actions", "haptic-scroll"] }
 *   ]
 *
 * We don't explode the comma list into individual selectors — the
 * browser's native `matches()` and `querySelectorAll()` handle compound
 * selectors fine, and keeping them grouped preserves the maker's intent.
 */
import type { EnhanceConfig } from './types.ts';

export interface CompiledSelector {
  selector: string;
  rules: readonly string[];
}

export function compileEnhanceConfig(config: EnhanceConfig | undefined): CompiledSelector[] {
  if (!config || typeof config !== 'object') return [];
  const out: CompiledSelector[] = [];
  for (const [selector, rules] of Object.entries(config)) {
    if (typeof selector !== 'string' || !selector.trim()) continue;
    if (!Array.isArray(rules) || rules.length === 0) continue;
    const cleanRules = rules.filter((r): r is string => typeof r === 'string' && !!r.trim());
    if (cleanRules.length === 0) continue;
    if (!isValidSelector(selector)) continue;
    out.push({ selector, rules: cleanRules });
  }
  return out;
}

/**
 * Validate the selector by trying it against a detached element. We
 * silently drop invalid selectors rather than throwing — a typo in
 * shippie.json shouldn't crash the maker's app.
 */
function isValidSelector(selector: string): boolean {
  if (typeof document === 'undefined') return true; // SSR: trust the input
  try {
    document.createDocumentFragment().querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

/**
 * Honor the per-element opt-out attribute. Elements with
 * `data-shippie-no-enhance` (or descendants of such an element) are
 * skipped by every rule.
 */
export function isEnhanceable(el: Element): boolean {
  return !el.closest('[data-shippie-no-enhance]');
}
