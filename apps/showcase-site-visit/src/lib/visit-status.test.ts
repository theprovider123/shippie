import { describe, expect, it } from 'bun:test';
import type { Check, Visit } from '../db/schema.ts';
import {
  MIN_COMPLETION_RATIO,
  canSubmit,
  hasOpenIssues,
  nextStatus,
  summariseCompletion,
} from './visit-status.ts';

const visit = (overrides: Partial<Visit> = {}): Visit => ({
  id: 'v1',
  site_id: 's1',
  status: 'in-progress',
  signature_svg: 'X'.repeat(20),
  ...overrides,
});

const check = (overrides: Partial<Check> = {}): Check => ({
  id: `c_${Math.random().toString(36).slice(2, 6)}`,
  visit_id: 'v1',
  label: 'thing',
  status: 'pending',
  notes: null,
  photo_paths: [],
  position: 0,
  ...overrides,
});

describe('summariseCompletion', () => {
  it('reports zero on empty checks', () => {
    const s = summariseCompletion([]);
    expect(s.total).toBe(0);
    expect(s.ratio).toBe(0);
    expect(s.meetsThreshold).toBe(false);
  });

  it('counts pass/fail/na/needs-attention as done', () => {
    const checks = [
      check({ status: 'pass' }),
      check({ status: 'fail' }),
      check({ status: 'na' }),
      check({ status: 'needs-attention' }),
      check({ status: 'pending' }),
    ];
    const s = summariseCompletion(checks);
    expect(s.total).toBe(5);
    expect(s.done).toBe(4);
    expect(s.ratio).toBeCloseTo(0.8, 2);
    expect(s.meetsThreshold).toBe(true);
  });

  it('flags below threshold', () => {
    const checks = Array.from({ length: 10 }, (_, i) =>
      check({ status: i < 5 ? 'pass' : 'pending' }),
    );
    const s = summariseCompletion(checks);
    expect(s.ratio).toBe(0.5);
    expect(s.meetsThreshold).toBe(MIN_COMPLETION_RATIO <= 0.5);
  });
});

describe('canSubmit', () => {
  it('blocks when no checks exist', () => {
    const result = canSubmit(visit(), []);
    expect(result.canSubmit).toBe(false);
    expect(result.reason).toContain('check');
  });

  it('blocks when below the completion threshold', () => {
    const checks = [
      check({ status: 'pass' }),
      check({ status: 'pending' }),
      check({ status: 'pending' }),
    ];
    const result = canSubmit(visit(), checks);
    expect(result.canSubmit).toBe(false);
    expect(result.reason).toMatch(/1 of 3/);
  });

  it('blocks when signature is missing', () => {
    const checks = Array.from({ length: 5 }, () => check({ status: 'pass' }));
    const result = canSubmit(visit({ signature_svg: null }), checks);
    expect(result.canSubmit).toBe(false);
    expect(result.reason).toMatch(/sign/i);
  });

  it('blocks when already submitted', () => {
    const checks = [check({ status: 'pass' })];
    const result = canSubmit(visit({ status: 'submitted' }), checks);
    expect(result.canSubmit).toBe(false);
    expect(result.reason).toMatch(/submitted/i);
  });

  it('passes when threshold met + signature present', () => {
    const checks = [
      check({ status: 'pass' }),
      check({ status: 'pass' }),
      check({ status: 'na' }),
      check({ status: 'pass' }),
      check({ status: 'pass' }),
    ];
    const result = canSubmit(visit(), checks);
    expect(result.canSubmit).toBe(true);
    expect(result.reason).toBeNull();
  });
});

describe('nextStatus', () => {
  it('moves in-progress to submitted on submit', () => {
    expect(nextStatus('in-progress', 'submit')).toBe('submitted');
  });

  it('moves submitted to amended on reopen', () => {
    expect(nextStatus('submitted', 'reopen')).toBe('amended');
  });

  it('keeps in-progress on reopen (no-op)', () => {
    expect(nextStatus('in-progress', 'reopen')).toBe('in-progress');
  });

  it('moves amended back to submitted on submit', () => {
    expect(nextStatus('amended', 'submit')).toBe('submitted');
  });
});

describe('hasOpenIssues', () => {
  it('flags fail and needs-attention', () => {
    expect(hasOpenIssues([check({ status: 'fail' })])).toBe(true);
    expect(hasOpenIssues([check({ status: 'needs-attention' })])).toBe(true);
  });

  it('returns false when only pass/na/pending', () => {
    expect(
      hasOpenIssues([check({ status: 'pass' }), check({ status: 'na' }), check({ status: 'pending' })]),
    ).toBe(false);
  });
});
