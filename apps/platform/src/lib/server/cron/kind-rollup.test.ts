/**
 * Pure-helper unit tests for the kind-status rollup. The integration
 * shape (D1 fan-out) is covered by the dispatcher test indirectly when
 * the daily cron fires; here we exercise the decision rule directly.
 */
import { describe, expect, test } from 'vitest';
import { deriveKindStatus } from './kind-rollup';

describe('deriveKindStatus — Local detection', () => {
  test('no events → estimated', () => {
    const r = deriveKindStatus('local', null, {});
    expect(r).toEqual({ kind: 'local', status: 'estimated' });
  });

  test('one event observed below threshold → verifying', () => {
    const r = deriveKindStatus('local', 'estimated', {
      kind_local_launch_offline: 1,
    });
    expect(r).toEqual({ kind: 'local', status: 'verifying' });
  });

  test('all events meet threshold → confirmed', () => {
    const r = deriveKindStatus('local', 'verifying', {
      kind_local_launch_offline: 3,
      kind_local_write_local: 5,
      kind_local_workflow_offline: 4,
    });
    expect(r).toEqual({ kind: 'local', status: 'confirmed' });
  });

  test('partial threshold (some met, some not) → verifying', () => {
    const r = deriveKindStatus('local', 'verifying', {
      kind_local_launch_offline: 5,
      kind_local_write_local: 1,
      kind_local_workflow_offline: 5,
    });
    expect(r).toEqual({ kind: 'local', status: 'verifying' });
  });
});

describe('deriveKindStatus — leak demotion', () => {
  test('Local → Connected on first leak', () => {
    const r = deriveKindStatus('local', 'confirmed', {
      kind_leak_personal_data: 1,
    });
    expect(r).toEqual({ kind: 'connected', status: 'verifying' });
  });

  test('Connected → Cloud on first leak', () => {
    const r = deriveKindStatus('connected', 'confirmed', {
      kind_leak_personal_data: 2,
    });
    expect(r).toEqual({ kind: 'cloud', status: 'verifying' });
  });

  test('Cloud is unaffected by leak events', () => {
    const r = deriveKindStatus('cloud', 'estimated', {
      kind_leak_personal_data: 5,
    });
    expect(r).toEqual({ kind: 'cloud', status: 'estimated' });
  });
});

describe('deriveKindStatus — Connected detection', () => {
  test('graceful-degrade events meet threshold → confirmed', () => {
    const r = deriveKindStatus('connected', 'estimated', {
      kind_local_workflow_offline: 3,
      kind_connected_graceful_degrade: 4,
    });
    expect(r).toEqual({ kind: 'connected', status: 'confirmed' });
  });

  test('only one of two events observed → verifying', () => {
    const r = deriveKindStatus('connected', 'estimated', {
      kind_connected_graceful_degrade: 5,
    });
    expect(r).toEqual({ kind: 'connected', status: 'verifying' });
  });
});

describe('deriveKindStatus — sticky disputed', () => {
  test('disputed status is preserved regardless of events', () => {
    const r = deriveKindStatus('local', 'disputed', {
      kind_local_launch_offline: 5,
      kind_local_write_local: 5,
      kind_local_workflow_offline: 5,
    });
    expect(r).toEqual({ kind: 'local', status: 'disputed' });
  });
});

describe('deriveKindStatus — Cloud detection (no proof needed)', () => {
  test('Cloud retains its prior status (or estimated)', () => {
    const r1 = deriveKindStatus('cloud', null, {});
    expect(r1).toEqual({ kind: 'cloud', status: 'estimated' });
    const r2 = deriveKindStatus('cloud', 'estimated', {});
    expect(r2).toEqual({ kind: 'cloud', status: 'estimated' });
  });
});
