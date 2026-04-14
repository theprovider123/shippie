/**
 * Preflight runner.
 *
 * Executes every registered rule against a PreflightInput and aggregates
 * findings into a PreflightReport. Rules run sequentially — order doesn't
 * matter for correctness, but earlier remediations can influence later
 * rules (e.g., auto-drafting shippie.json before reading it).
 *
 * Spec v6 §10.4.
 */
import type {
  PreflightContext,
  PreflightFinding,
  PreflightInput,
  PreflightReport,
  PreflightRule,
} from './types.ts';

export async function runPreflight(
  input: PreflightInput,
  rules: readonly PreflightRule[],
): Promise<PreflightReport> {
  const start = Date.now();
  const findings: PreflightFinding[] = [];
  const remediations: PreflightFinding[] = [];

  const ctx: PreflightContext = {
    input,
    async remediate(action, summary, fn) {
      try {
        await fn();
        const finding: PreflightFinding = {
          rule: '__auto_remediation__',
          severity: 'fix',
          title: action,
          detail: summary,
          remediation: { kind: action, summary },
        };
        remediations.push(finding);
        return true;
      } catch {
        return false;
      }
    },
  };

  for (const rule of rules) {
    try {
      const result = await rule.run(ctx);
      findings.push(...result);
    } catch (err) {
      findings.push({
        rule: rule.id,
        severity: 'block',
        title: `${rule.title} — rule threw`,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const warnings = findings.filter((f) => f.severity === 'warn');
  const blockers = findings.filter((f) => f.severity === 'block');

  return {
    passed: blockers.length === 0,
    findings,
    remediations,
    warnings,
    blockers,
    durationMs: Date.now() - start,
  };
}
