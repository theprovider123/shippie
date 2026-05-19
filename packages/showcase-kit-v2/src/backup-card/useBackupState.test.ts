import { describe, expect, test } from 'bun:test';
import { reduceBackupState, type BackupState } from './useBackupState';

describe('backup state reducer', () => {
  test('idle → backing-up → backed-up', () => {
    let s: BackupState = { status: 'idle', lastBackupAt: null };
    s = reduceBackupState(s, { type: 'backup:start' });
    expect(s.status).toBe('backing-up');
    s = reduceBackupState(s, { type: 'backup:success', at: 1700000000000 });
    expect(s.status).toBe('backed-up');
    expect(s.lastBackupAt).toBe(1700000000000);
  });

  test('idle → restoring → restored (back to idle)', () => {
    let s: BackupState = { status: 'idle', lastBackupAt: null };
    s = reduceBackupState(s, { type: 'restore:start' });
    expect(s.status).toBe('restoring');
    s = reduceBackupState(s, { type: 'restore:success' });
    expect(s.status).toBe('idle');
  });

  test('failure returns to idle with error', () => {
    const s = reduceBackupState(
      { status: 'backing-up', lastBackupAt: null },
      { type: 'backup:fail', error: 'bad passphrase' },
    );
    expect(s.status).toBe('idle');
    expect(s.error).toBe('bad passphrase');
  });

  test('reset clears state', () => {
    const s = reduceBackupState(
      { status: 'backed-up', lastBackupAt: 123, error: 'x' },
      { type: 'reset' },
    );
    expect(s).toEqual({ status: 'idle', lastBackupAt: null });
  });
});
