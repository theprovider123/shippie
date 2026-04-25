// packages/sdk/src/wrapper/observe/index.ts
/**
 * Public entry for the wrapper's DOM observation runtime.
 *
 * Two consumption modes:
 *   1. Auto via wrapper bootstrap: `startObserve(config)` is called by
 *      `observe-init.ts` after the wrapper reads `shippie.json`.
 *   2. Manual: a host app may register additional rules via
 *      `registerRule` and call `startObserve(extraConfig)` directly.
 */
export { registerRule, listRules, disableRule } from './registry.ts';
export type { EnhanceRule, EnhanceConfig, Capability, RuleBudget } from './types.ts';
export { hasCapability } from './capability-gate.ts';
export { compileEnhanceConfig, isEnhanceable } from './selector-engine.ts';
export { compileEnhanceConfigFromProfile, type CompilableProfile } from './compiler.ts';
export { onShareReceive } from './rules/index.ts';

import { startDispatch, type DispatcherOptions } from './mutation-observer.ts';
import { registerBuiltins } from './rules/index.ts';

/**
 * Start the observer with a given enhance config. Returns a stop()
 * handle. Idempotent — multiple calls produce independent dispatchers
 * but they share the rule registry, so running two with overlapping
 * selectors will double-apply. Don't do that.
 */
export function startObserve(opts: DispatcherOptions) {
  registerBuiltins();
  return startDispatch(opts);
}
