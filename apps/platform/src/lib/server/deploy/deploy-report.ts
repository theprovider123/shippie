/**
 * Deploy report — Phase 2 deploy intelligence artifact.
 *
 * Built from the security scan, privacy audit, kind classification, and
 * pipeline-step records produced during a deploy. Stored as a static
 * JSON object at apps/{slug}/v{version}/_shippie/deploy-report.json in
 * the apps R2 bucket.
 *
 * Why JSON in R2 (not just a D1 row):
 *   - Phase 9 Hub MVP can serve the same artifact off the local network
 *     without talking to D1.
 *   - Phase 3 Deploy Stream can replay events from this artifact.
 *   - Makers can curl their own report for diffing across versions.
 */

import type {
  SecurityFinding,
  SecurityScanReport,
  PrivacyAuditReport,
  SecurityScore,
  PrivacyGradeResult,
  LocalizePatch,
} from '@shippie/analyse';
import type { AppKindProfile } from '$lib/types/app-kind';
import type { RouteModeDecision } from './route-mode';

/** Schema version of the deploy report. Bump when fields move. */
export const DEPLOY_REPORT_SCHEMA = 1;

export interface DeployReport {
  schema: typeof DEPLOY_REPORT_SCHEMA;
  /** ISO timestamp the report was generated. */
  generatedAt: string;
  /** App slug + version this report describes. */
  slug: string;
  version: number;
  /** Wall-clock duration of the deploy in ms. */
  durationMs: number;
  /** Files in the uploaded bundle (post-extract). */
  files: number;
  totalBytes: number;

  /** Runtime routing behavior for unknown navigations. */
  routing?: RouteModeDecision;

  /** App Kinds classification (already first-class — surfaces for the
   *  trust card and marketplace badge). */
  kind: {
    detected: AppKindProfile['detectedKind'];
    declared: AppKindProfile['declaredKind'];
    public: AppKindProfile['publicKind'];
    publicStatus: AppKindProfile['publicKindStatus'];
    confidence: AppKindProfile['confidence'];
    reasons: AppKindProfile['reasons'];
  };

  /** Phase 4 Stage A — maker-facing security report. Numeric score is
   *  computed internally to tune weights against real deploys; promotion
   *  to public surface comes in Stage B once the scanner has proven
   *  itself. */
  security: {
    findings: SecurityFinding[];
    blocks: number;
    warns: number;
    infos: number;
    scannedFiles: number;
    /** Internal-only until Stage B. Surfaces in dashboard report page. */
    score?: SecurityScore;
  };

  /** Phase 4 Stage A — maker-facing privacy report. Grade is private
   *  until Stage B promotion. */
  privacy: PrivacyAuditReport & {
    /** Internal-only until Stage B. */
    grade?: PrivacyGradeResult;
  };

  /** Step-by-step record of what the pipeline did. Phase 3 turns this
   *  into the live event stream — until then it's a flat list. */
  steps: DeployStep[];

  /**
   * Phase 8 Localize V1 — source-migration offers detected at deploy time.
   * Empty array when no transforms apply (already local-first apps don't
   * see this). Each entry summarizes the patch the maker can review.
   *
   * Per the master plan: source migration, not runtime shim. The maker
   * MUST opt-in via the dashboard before any file change is applied.
   * Today this is preview-only.
   */
  localizeOffers?: LocalizeOfferSummary[];

  /**
   * Container commons package metadata. The app assets already live under
   * apps/{slug}/v{version}; v1 writes the portable package metadata beside
   * the deploy report and records the deterministic package hash.
   */
  package?: PackageArtifactSummary;
}

/** Compact representation of a LocalizePatch — full content lives in
 *  a separate R2 artifact when the maker opens the localize dashboard,
 *  so the deploy-report stays small. */
export interface LocalizeOfferSummary {
  transform: LocalizePatch['transform'];
  fileChangeCount: number;
  newFileCount: number;
  warnings: string[];
  /** First few file paths affected — for a quick "this would touch X" preview. */
  sampleFiles: string[];
}

export interface PackageArtifactSummary {
  packageHash: string;
  artifactPrefix: string;
  archiveKey: string;
  manifestKey: string;
  metadataFiles: number;
  totalPackageFiles: number;
}

export interface DeployStep {
  /** Stable id for the dashboard / stream. */
  id: string;
  /** Short verb-phrase shown in the report. */
  title: string;
  status: 'ok' | 'warn' | 'block' | 'skipped';
  /** ms since deploy start when this step finished. */
  finishedAtMs: number;
  /** Optional details surfaced under the step. */
  notes?: string[];
}

export function emptyReport(slug: string, version: number): DeployReport {
  return {
    schema: DEPLOY_REPORT_SCHEMA,
    generatedAt: new Date().toISOString(),
    slug,
    version,
    durationMs: 0,
    files: 0,
    totalBytes: 0,
    kind: {
      detected: 'connected',
      declared: undefined,
      public: 'connected',
      publicStatus: 'estimated',
      confidence: 0,
      reasons: [],
    },
    security: { findings: [], blocks: 0, warns: 0, infos: 0, scannedFiles: 0 },
    privacy: {
      domains: [],
      counts: {
        tracker: 0,
        feature: 0,
        cdn: 0,
        shippie: 0,
        'same-origin': 0,
        unknown: 0,
      },
      scannedFiles: 0,
    },
    steps: [],
  };
}

/**
 * R2 key for a given deploy report. Lives in the same bucket as the
 * deployed files, under a sub-prefix the runtime never serves.
 */
export function deployReportKey(slug: string, version: number): string {
  return `apps/${slug}/v${version}/_shippie/deploy-report.json`;
}

export function packageArtifactPrefix(slug: string, version: number): string {
  return `apps/${slug}/v${version}/_shippie/package`;
}

export function packageArtifactKey(slug: string, version: number, path: string): string {
  return `${packageArtifactPrefix(slug, version)}/${path}`;
}
