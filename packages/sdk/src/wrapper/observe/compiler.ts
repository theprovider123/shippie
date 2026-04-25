/**
 * Compile a recommended-enhance map (from the deploy-time analyse step)
 * into the EnhanceConfig the observer consumes.
 *
 * Today this is mostly identity — kept as a function so future logic
 * (rule de-duplication, capability gating, max-rule cap, selector
 * normalisation) has a clean home without changing call sites.
 *
 * The profile shape is defined locally as a subset of @shippie/analyse's
 * AppProfile so this package doesn't take a hard dep on analyse — they
 * share a contract over data, not over types.
 */
import type { EnhanceConfig } from './types.ts';

export interface CompilableProfile {
  recommended: { enhance: Record<string, readonly string[]> };
}

export function compileEnhanceConfigFromProfile(profile: CompilableProfile): EnhanceConfig {
  const out: Record<string, string[]> = {};
  for (const [selector, rules] of Object.entries(profile.recommended.enhance)) {
    if (rules.length === 0) continue;
    const deduped = [...new Set(rules)];
    if (deduped.length > 0) out[selector] = deduped;
  }
  return out;
}
