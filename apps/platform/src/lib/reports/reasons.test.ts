import { describe, expect, test } from 'vitest';
import { isValidReportReason, normalizeReportInput, REPORT_DETAIL_MAX } from './reasons';

describe('isValidReportReason', () => {
  test('accepts known reasons', () => {
    expect(isValidReportReason('malware')).toBe(true);
    expect(isValidReportReason('other')).toBe(true);
  });
  test('rejects unknown / non-string', () => {
    expect(isValidReportReason('nonsense')).toBe(false);
    expect(isValidReportReason(undefined)).toBe(false);
    expect(isValidReportReason(42)).toBe(false);
  });
});

describe('normalizeReportInput', () => {
  test('valid reason + trimmed detail', () => {
    expect(normalizeReportInput({ reason: 'abuse', detail: '  it does X  ' })).toEqual({
      reason: 'abuse',
      detail: 'it does X',
    });
  });
  test('empty detail → null', () => {
    expect(normalizeReportInput({ reason: 'malware', detail: '   ' })).toEqual({
      reason: 'malware',
      detail: null,
    });
  });
  test('caps detail length', () => {
    const long = 'x'.repeat(REPORT_DETAIL_MAX + 500);
    expect(normalizeReportInput({ reason: 'other', detail: long })!.detail!.length).toBe(REPORT_DETAIL_MAX);
  });
  test('invalid reason → null', () => {
    expect(normalizeReportInput({ reason: 'spammy', detail: 'x' })).toBeNull();
  });
});
