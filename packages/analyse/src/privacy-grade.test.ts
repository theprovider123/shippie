import { describe, expect, test } from 'bun:test';
import { computePrivacyGrade } from './privacy-grade.ts';
import type { PrivacyAuditReport } from './privacy-audit.ts';

function reportWith(
  counts: Partial<PrivacyAuditReport['counts']>,
): PrivacyAuditReport {
  return {
    domains: [],
    counts: {
      tracker: 0,
      feature: 0,
      cdn: 0,
      shippie: 0,
      'same-origin': 0,
      unknown: 0,
      ...counts,
    },
    scannedFiles: 1,
  };
}

describe('computePrivacyGrade', () => {
  test('no external = A+', () => {
    const r = computePrivacyGrade(reportWith({}));
    expect(r.grade).toBe('A+');
  });

  test('shippie infra alone = A+', () => {
    const r = computePrivacyGrade(reportWith({ shippie: 1, 'same-origin': 2 }));
    expect(r.grade).toBe('A+');
  });

  test('cdn only = A', () => {
    const r = computePrivacyGrade(reportWith({ cdn: 2 }));
    expect(r.grade).toBe('A');
    expect(r.reason).toContain('CDN');
  });

  test('declared feature host = B', () => {
    const r = computePrivacyGrade(reportWith({ feature: 1, cdn: 1 }));
    expect(r.grade).toBe('B');
    expect(r.reason).toContain('feature');
  });

  test('undeclared external host = C', () => {
    const r = computePrivacyGrade(reportWith({ unknown: 1 }));
    expect(r.grade).toBe('C');
    expect(r.reason).toContain('undeclared');
  });

  test('any tracker = F', () => {
    const r = computePrivacyGrade(reportWith({ tracker: 1 }));
    expect(r.grade).toBe('F');
    expect(r.reason).toContain('tracker');
  });

  test('tracker beats undeclared (F wins over C)', () => {
    const r = computePrivacyGrade(reportWith({ tracker: 1, unknown: 5 }));
    expect(r.grade).toBe('F');
  });

  test('reason is one sentence (no newline)', () => {
    const grades: Array<Partial<PrivacyAuditReport['counts']>> = [
      {},
      { cdn: 1 },
      { feature: 1 },
      { unknown: 1 },
      { tracker: 1 },
    ];
    for (const counts of grades) {
      const r = computePrivacyGrade(reportWith(counts));
      expect(r.reason).not.toContain('\n');
      expect(r.reason.length).toBeGreaterThan(20);
    }
  });
});
