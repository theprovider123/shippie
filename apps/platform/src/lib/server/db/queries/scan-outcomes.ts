/**
 * Phase B3 — Stage B harness queries.
 *
 * Records maker disposition on Phase 4 Stage A scanner findings, and
 * computes the false-positive rate per scanner so we can decide when to
 * promote a scanner's findings into the public-facing trust UX.
 *
 * Disposition meaning:
 *   - 'real' — maker confirms the finding is a real issue (resolved or not)
 *   - 'false_positive' — scanner is wrong; maker says no issue exists
 *   - 'wont_fix' — maker acknowledges but accepts the risk
 *   - 'acknowledged' — maker has seen the finding (default for "Stay")
 *
 * 'real' / 'wont_fix' / 'acknowledged' all weigh as "true positive" for
 * promotion-rate purposes. Only 'false_positive' counts against the
 * scanner.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { ShippieDb } from '../client';
import {
  deployScanOutcomes,
  isScanDisposition,
  type DeployScanOutcome,
  type NewDeployScanOutcome,
  type ScanDisposition,
} from '../schema';

export interface RecordScanOutcomeInput {
  deployId: string;
  appId: string;
  scanner: string;
  scannerVersion: string;
  findingId: string;
  severity: string;
  disposition: ScanDisposition;
  note?: string;
}

/**
 * Upsert a maker's disposition for a (deploy, scanner, finding) triple.
 * Re-recording with a different disposition replaces the previous one.
 */
export async function recordScanOutcome(
  db: ShippieDb,
  input: RecordScanOutcomeInput,
): Promise<void> {
  if (!isScanDisposition(input.disposition)) {
    throw new Error(`Invalid disposition: ${input.disposition}`);
  }
  const row: NewDeployScanOutcome = {
    deployId: input.deployId,
    appId: input.appId,
    scanner: input.scanner,
    scannerVersion: input.scannerVersion,
    findingId: input.findingId,
    severity: input.severity,
    disposition: input.disposition,
    note: input.note ?? null,
  };
  await db
    .insert(deployScanOutcomes)
    .values(row)
    .onConflictDoUpdate({
      target: [
        deployScanOutcomes.deployId,
        deployScanOutcomes.scanner,
        deployScanOutcomes.findingId,
      ],
      set: {
        disposition: row.disposition,
        severity: row.severity,
        note: row.note,
        scannerVersion: row.scannerVersion,
        recordedAt: sql`(datetime('now'))`,
      },
    });
}

export async function outcomesForDeploy(
  db: ShippieDb,
  deployId: string,
): Promise<DeployScanOutcome[]> {
  return db
    .select()
    .from(deployScanOutcomes)
    .where(eq(deployScanOutcomes.deployId, deployId));
}

export async function outcomesForScanner(
  db: ShippieDb,
  scanner: string,
): Promise<DeployScanOutcome[]> {
  return db
    .select()
    .from(deployScanOutcomes)
    .where(eq(deployScanOutcomes.scanner, scanner));
}

export async function outcomeForFinding(
  db: ShippieDb,
  deployId: string,
  scanner: string,
  findingId: string,
): Promise<DeployScanOutcome | null> {
  const rows = await db
    .select()
    .from(deployScanOutcomes)
    .where(
      and(
        eq(deployScanOutcomes.deployId, deployId),
        eq(deployScanOutcomes.scanner, scanner),
        eq(deployScanOutcomes.findingId, findingId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export interface ScannerFalsePositiveStat {
  scanner: string;
  total: number;
  falsePositives: number;
  /** 0..1 — percentage of recorded dispositions that were FP. */
  rate: number;
}

/**
 * Pure aggregator. Takes a flat list of outcomes and groups by scanner
 * to compute false-positive rate. Pure so tests don't have to fake D1
 * aggregation SQL — the caller queries with `outcomesForScanner` (or
 * a date-range variant) and passes the rows in.
 */
export function aggregateFalsePositiveRate(
  outcomes: ReadonlyArray<Pick<DeployScanOutcome, 'scanner' | 'disposition'>>,
): ScannerFalsePositiveStat[] {
  const byScanner = new Map<string, { total: number; fp: number }>();
  for (const o of outcomes) {
    const stat = byScanner.get(o.scanner) ?? { total: 0, fp: 0 };
    stat.total += 1;
    if (o.disposition === 'false_positive') stat.fp += 1;
    byScanner.set(o.scanner, stat);
  }
  return [...byScanner.entries()]
    .map(([scanner, { total, fp }]) => ({
      scanner,
      total,
      falsePositives: fp,
      rate: total === 0 ? 0 : fp / total,
    }))
    .sort((a, b) => a.scanner.localeCompare(b.scanner));
}

/**
 * Stage B promotion gate: we promote a scanner from maker-facing to
 * public-facing trust UX once its false-positive rate is below the
 * threshold AND we have a minimum sample size. Default thresholds match
 * the master plan; callers can override for individual scanners.
 */
export interface PromotionDecision {
  scanner: string;
  ready: boolean;
  reason: 'rate_too_high' | 'sample_too_small' | 'ready';
  rate: number;
  total: number;
}

export function promotionReady(
  stat: ScannerFalsePositiveStat,
  thresholds: { maxRate?: number; minSample?: number } = {},
): PromotionDecision {
  const maxRate = thresholds.maxRate ?? 0.05; // 5% FP cap by default
  const minSample = thresholds.minSample ?? 200; // need 200+ recorded dispositions
  if (stat.total < minSample) {
    return { scanner: stat.scanner, ready: false, reason: 'sample_too_small', rate: stat.rate, total: stat.total };
  }
  if (stat.rate > maxRate) {
    return { scanner: stat.scanner, ready: false, reason: 'rate_too_high', rate: stat.rate, total: stat.total };
  }
  return { scanner: stat.scanner, ready: true, reason: 'ready', rate: stat.rate, total: stat.total };
}
