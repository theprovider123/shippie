import { describe, expect, test } from 'bun:test';
import {
  computeGraduation,
  describeGraduationTier,
  type DeploySignals,
  type UsageSignals,
} from './graduation.ts';

const baseDeploy: DeploySignals = {
  securityScore: 90,
  privacyGrade: 'A',
  category: 'cooking',
  intentsProvided: 0,
  intentsConsumed: 0,
  externalDomainCount: 0,
};

const usageStrong: UsageSignals = {
  weeklyActiveUsers: 100,
  weeksWithActivity: 4,
  medianSessionSeconds: 60,
  day1RetentionRate: 0.45,
};

describe('computeGraduation', () => {
  test('returns experimental when security score is below 70', () => {
    const report = computeGraduation({
      deploy: { ...baseDeploy, securityScore: 50 },
    });
    expect(report.tier).toBe('experimental');
    expect(report.nextTierCriteria.some((c) => /security score/.test(c))).toBe(true);
  });

  test('returns experimental when privacy grade is C or worse', () => {
    const report = computeGraduation({
      deploy: { ...baseDeploy, privacyGrade: 'C' },
    });
    expect(report.tier).toBe('experimental');
  });

  test('returns maker-friendly when posture is clean but no usage signals', () => {
    const report = computeGraduation({ deploy: baseDeploy });
    expect(report.tier).toBe('maker-friendly');
    expect(report.nextTierCriteria.some((c) => /usage signals/.test(c))).toBe(true);
    expect(report.nextTier).toBe('lived-in');
  });

  test('returns maker-friendly when usage is weak', () => {
    const report = computeGraduation({
      deploy: baseDeploy,
      usage: { ...usageStrong, weeklyActiveUsers: 5 },
    });
    expect(report.tier).toBe('maker-friendly');
    expect(report.nextTierCriteria.some((c) => /weekly active users/.test(c))).toBe(true);
  });

  test('returns lived-in when usage is strong but no cross-app intents', () => {
    const report = computeGraduation({
      deploy: baseDeploy,
      usage: usageStrong,
    });
    expect(report.tier).toBe('lived-in');
    expect(report.nextTierCriteria.some((c) => /cross-app intent/.test(c))).toBe(true);
  });

  test('returns graduate when all criteria are met', () => {
    const report = computeGraduation({
      deploy: { ...baseDeploy, intentsProvided: 1, intentsConsumed: 1 },
      usage: usageStrong,
    });
    expect(report.tier).toBe('graduate');
    expect(report.nextTier).toBe(null);
    expect(report.nextTierCriteria).toEqual([]);
  });

  test('lived-in flags AppProfile category gap when category is unknown', () => {
    const report = computeGraduation({
      deploy: { ...baseDeploy, intentsProvided: 1, category: 'unknown' },
      usage: usageStrong,
    });
    expect(report.tier).toBe('lived-in');
    expect(report.nextTierCriteria.some((c) => /AppProfile classifier/.test(c))).toBe(true);
  });

  test('earnedCriteria reflects every passed gate', () => {
    const report = computeGraduation({
      deploy: { ...baseDeploy, intentsProvided: 1 },
      usage: usageStrong,
    });
    expect(report.earnedCriteria).toContain('security score ≥ 70');
    expect(report.earnedCriteria).toContain('privacy grade B or better');
    expect(report.earnedCriteria).toContain(`${usageStrong.weeklyActiveUsers} weekly active users`);
    expect(report.earnedCriteria).toContain('declared cross-app intent participation');
  });
});

describe('describeGraduationTier', () => {
  test('returns a sentence per tier', () => {
    expect(describeGraduationTier('experimental')).toMatch(/Experimental/);
    expect(describeGraduationTier('maker-friendly')).toMatch(/Maker-friendly/);
    expect(describeGraduationTier('lived-in')).toMatch(/Lived-in/);
    expect(describeGraduationTier('graduate')).toMatch(/Graduate/);
  });
});
