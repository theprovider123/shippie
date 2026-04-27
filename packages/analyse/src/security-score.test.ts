import { describe, expect, test } from 'bun:test';
import { computeSecurityScore } from './security-score.ts';
import type { SecurityScanReport, SecurityFinding } from './security-scan.ts';

function reportFor(findings: SecurityFinding[]): SecurityScanReport {
  return {
    findings,
    blocks: findings.filter((f) => f.severity === 'block').length,
    warns: findings.filter((f) => f.severity === 'warn').length,
    infos: findings.filter((f) => f.severity === 'info').length,
    scannedFiles: 1,
  };
}

const finding = (
  rule: SecurityFinding['rule'],
  severity: SecurityFinding['severity'],
): SecurityFinding => ({
  rule,
  severity,
  title: 't',
  reason: 'r',
  location: 'src/x.ts',
});

describe('computeSecurityScore', () => {
  test('clean report scores 100', () => {
    const score = computeSecurityScore(reportFor([]));
    expect(score.value).toBe(100);
    expect(score.deductions.length).toBe(0);
  });

  test('AWS key drops 30', () => {
    const score = computeSecurityScore(
      reportFor([finding('secret_aws_access_key', 'block')]),
    );
    expect(score.value).toBe(70);
    expect(score.deductions[0]?.rule).toBe('secret_aws_access_key');
    expect(score.deductions[0]?.delta).toBe(-30);
  });

  test('multiple distinct findings stack', () => {
    const score = computeSecurityScore(
      reportFor([
        finding('secret_aws_access_key', 'block'),
        finding('mixed_content', 'warn'),
        finding('inline_event_handler', 'info'),
      ]),
    );
    // 100 - 30 - 5 - 2 = 63
    expect(score.value).toBe(63);
  });

  test('repeated occurrences of same rule cap at 3', () => {
    // 5 mixed_content findings — capped at 3 × -5 = -15
    const findings = Array.from({ length: 5 }, () => finding('mixed_content', 'warn'));
    const score = computeSecurityScore(reportFor(findings));
    expect(score.value).toBe(85);
    const deduction = score.deductions.find((d) => d.rule === 'mixed_content');
    expect(deduction?.count).toBe(5);
    expect(deduction?.delta).toBe(-15);
  });

  test('floors at 0, never negative', () => {
    // 3 × -30 (AWS) + 3 × -30 (Stripe) + 3 × -25 (GitHub) + ... well over 100 of damage
    const findings: SecurityFinding[] = [
      ...Array.from({ length: 3 }, () => finding('secret_aws_access_key', 'block')),
      ...Array.from({ length: 3 }, () => finding('secret_stripe_key', 'block')),
      ...Array.from({ length: 3 }, () => finding('secret_github_token', 'block')),
    ];
    const score = computeSecurityScore(reportFor(findings));
    expect(score.value).toBe(0);
  });

  test('blocks count carried through', () => {
    const score = computeSecurityScore(
      reportFor([
        finding('secret_aws_access_key', 'block'),
        finding('secret_stripe_key', 'block'),
      ]),
    );
    expect(score.blocks).toBe(2);
  });

  test('explainable: every deduction has a reason', () => {
    const score = computeSecurityScore(
      reportFor([
        finding('secret_aws_access_key', 'block'),
        finding('mixed_content', 'warn'),
      ]),
    );
    for (const d of score.deductions) {
      expect(d.reason.length).toBeGreaterThan(20);
      expect(d.delta).toBeLessThan(0);
    }
  });
});
