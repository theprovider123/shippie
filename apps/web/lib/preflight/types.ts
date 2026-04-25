/**
 * Preflight framework types.
 *
 * Every preflight rule produces a PreflightFinding. A rule can emit:
 *   - pass     — check succeeded
 *   - warn     — soft issue that doesn't block deploy
 *   - block    — hard fail that stops the deploy
 *   - fix      — auto-remediated; includes the remediation action taken
 *
 * Spec v6 §10.4 (auto-remediation before preflight block).
 */
import type { ShippieJson } from '@shippie/shared';

export type PreflightSeverity = 'pass' | 'warn' | 'block' | 'fix';

export interface PreflightFinding {
  rule: string;
  severity: PreflightSeverity;
  title: string;
  detail?: string;
  metadata?: Record<string, unknown>;
  remediation?: {
    kind: string;
    summary: string;
  };
}

export interface PreflightReport {
  passed: boolean;
  findings: PreflightFinding[];
  remediations: PreflightFinding[];
  warnings: PreflightFinding[];
  blockers: PreflightFinding[];
  durationMs: number;
}

/**
 * Inputs a preflight rule can inspect. This is a lightweight snapshot
 * of everything we know about a deploy at preflight time.
 */
export interface PreflightInput {
  /** Raw shippie.json (possibly auto-drafted). */
  manifest: ShippieJson;

  /** Manifest state: maker-provided, auto-drafted, or merged. */
  manifestSource: 'maker' | 'auto-drafted' | 'merged';

  /**
   * Source tree file list. Paths relative to the source root.
   * Populated by the deploy pipeline after extracting the zip or
   * shallow-cloning the GitHub repo.
   */
  sourceFiles: readonly string[];

  /**
   * Output tree file list (post-build). Empty for static uploads that
   * skipped the build phase. Populated for pipelines that ran a build.
   */
  outputFiles: readonly string[];

  /**
   * Optional map of source file path -> raw bytes. When provided, rules
   * can peek into content-sensitive files (package.json, next.config.*,
   * etc.). Omitted by pipelines that only care about paths, so rules
   * must gracefully degrade to path-only checks when absent.
   */
  fileContents?: ReadonlyMap<string, Buffer>;

  /** Package manager detected from lockfile, if any. */
  packageManager?: 'npm' | 'pnpm' | 'yarn' | 'bun';

  /** Framework detected from config files or package.json deps. */
  framework?: string;

  /** Total output size in bytes. Used for quota checks. */
  outputBytes?: number;

  /**
   * Pre-computed reserved-slug list from reserved_slugs table. Passed
   * in to avoid per-rule database access.
   */
  reservedSlugs: ReadonlySet<string>;

  /** Existing app, if this is a re-deploy. */
  existingApp?: {
    id: string;
    slug: string;
    maker_id: string;
  };
}

export interface PreflightContext {
  input: PreflightInput;
  /**
   * Fix-at-preflight: rules can call this to emit a remediation that
   * the runner applies before the check fails. Returns true if the
   * remediation was applied cleanly.
   */
  remediate(action: string, summary: string, fn: () => void | Promise<void>): Promise<boolean>;
}

export interface PreflightRule {
  id: string;
  title: string;
  /**
   * Return findings describing what the rule observed.
   * A rule may return multiple findings (one per file, for example).
   */
  run(ctx: PreflightContext): Promise<PreflightFinding[]> | PreflightFinding[];
}
