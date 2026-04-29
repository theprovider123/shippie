import { describe, expect, test } from 'vitest';
import {
  aggregateFalsePositiveRate,
  promotionReady,
} from './scan-outcomes';
import { isScanDisposition } from '../schema';

describe('isScanDisposition — B3 disposition validator', () => {
  test('accepts the four canonical dispositions', () => {
    for (const d of ['real', 'false_positive', 'wont_fix', 'acknowledged']) {
      expect(isScanDisposition(d)).toBe(true);
    }
  });

  test('rejects unknown values', () => {
    expect(isScanDisposition('resolved')).toBe(false);
    expect(isScanDisposition('')).toBe(false);
    expect(isScanDisposition('REAL')).toBe(false);
  });
});

describe('aggregateFalsePositiveRate — B3 stat aggregator', () => {
  test('returns empty array for no outcomes', () => {
    expect(aggregateFalsePositiveRate([])).toEqual([]);
  });

  test('counts total + false-positives per scanner', () => {
    const outcomes = [
      { scanner: 'security-scan', disposition: 'real' as const },
      { scanner: 'security-scan', disposition: 'false_positive' as const },
      { scanner: 'security-scan', disposition: 'real' as const },
      { scanner: 'privacy-audit', disposition: 'false_positive' as const },
    ];
    const stats = aggregateFalsePositiveRate(outcomes);
    expect(stats).toEqual([
      { scanner: 'privacy-audit', total: 1, falsePositives: 1, rate: 1 },
      { scanner: 'security-scan', total: 3, falsePositives: 1, rate: 1 / 3 },
    ]);
  });

  test('treats real / wont_fix / acknowledged as true positives', () => {
    const stats = aggregateFalsePositiveRate([
      { scanner: 'security-scan', disposition: 'real' },
      { scanner: 'security-scan', disposition: 'wont_fix' },
      { scanner: 'security-scan', disposition: 'acknowledged' },
      { scanner: 'security-scan', disposition: 'false_positive' },
    ]);
    expect(stats).toEqual([
      { scanner: 'security-scan', total: 4, falsePositives: 1, rate: 0.25 },
    ]);
  });

  test('rate is 0 when scanner has only true positives', () => {
    const stats = aggregateFalsePositiveRate([
      { scanner: 'privacy-audit', disposition: 'real' },
      { scanner: 'privacy-audit', disposition: 'real' },
    ]);
    expect(stats[0]?.rate).toBe(0);
  });

  test('output is sorted by scanner name for stable display', () => {
    const stats = aggregateFalsePositiveRate([
      { scanner: 'z-scanner', disposition: 'real' },
      { scanner: 'a-scanner', disposition: 'real' },
      { scanner: 'm-scanner', disposition: 'real' },
    ]);
    expect(stats.map((s) => s.scanner)).toEqual(['a-scanner', 'm-scanner', 'z-scanner']);
  });
});

describe('promotionReady — B3 Stage B gate', () => {
  test('blocks when sample size is below minSample', () => {
    const decision = promotionReady(
      { scanner: 'security-scan', total: 50, falsePositives: 0, rate: 0 },
    );
    expect(decision.ready).toBe(false);
    expect(decision.reason).toBe('sample_too_small');
  });

  test('blocks when false-positive rate exceeds the cap', () => {
    const decision = promotionReady(
      { scanner: 'security-scan', total: 1000, falsePositives: 100, rate: 0.1 },
    );
    expect(decision.ready).toBe(false);
    expect(decision.reason).toBe('rate_too_high');
  });

  test('passes when sample is large enough and rate is below the cap', () => {
    const decision = promotionReady(
      { scanner: 'security-scan', total: 1000, falsePositives: 30, rate: 0.03 },
    );
    expect(decision.ready).toBe(true);
    expect(decision.reason).toBe('ready');
  });

  test('honours custom thresholds', () => {
    const decision = promotionReady(
      { scanner: 'security-scan', total: 50, falsePositives: 1, rate: 0.02 },
      { minSample: 30, maxRate: 0.05 },
    );
    expect(decision.ready).toBe(true);
  });
});
