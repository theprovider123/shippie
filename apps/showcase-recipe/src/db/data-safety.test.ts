import { describe, expect, it } from 'bun:test';
import {
  BACKUP_META_KEY,
  PERSISTENCE_META_KEY,
  PROMPT_STATE_KEY,
  chooseStartupBackupPrompt,
  deriveIosRiskLevel,
  deriveStorageStatus,
  dismissInstallNudge,
  hasRequestedPersistence,
  loadBackupMeta,
  loadPersistenceMeta,
  recordRecipeSaveAndChoosePrompt,
  saveBackupMeta,
  shouldNudgeInstall,
} from './data-safety.ts';

class TestStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('recipe data safety prompts', () => {
  it('records backup metadata in local storage', () => {
    const storage = new TestStorage();
    const meta = saveBackupMeta(
      {
        createdAt: '2026-05-08T10:00:00.000Z',
        encrypted: true,
        recipeCount: 3,
        ingredientCount: 9,
        contentHash: 'abc',
      },
      storage,
    );

    expect(meta?.recipeCount).toBe(3);
    expect(loadBackupMeta(storage)?.contentHash).toBe('abc');
    expect(storage.getItem(BACKUP_META_KEY)).toContain('2026-05-08');
  });

  it('prompts on first and fifth user saves', () => {
    const storage = new TestStorage();
    const backup = loadBackupMeta(storage);

    expect(recordRecipeSaveAndChoosePrompt(backup, new Date('2026-05-08'), storage)).toBe(
      'first-save',
    );
    expect(recordRecipeSaveAndChoosePrompt(backup, new Date('2026-05-08'), storage)).toBeNull();
    expect(recordRecipeSaveAndChoosePrompt(backup, new Date('2026-05-08'), storage)).toBeNull();
    expect(recordRecipeSaveAndChoosePrompt(backup, new Date('2026-05-08'), storage)).toBeNull();
    expect(recordRecipeSaveAndChoosePrompt(backup, new Date('2026-05-08'), storage)).toBe(
      'five-saves',
    );
    expect(storage.getItem(PROMPT_STATE_KEY)).toContain('"userSaves":5');
  });

  it('startup prompt only fires for stale backups after real saves', () => {
    const storage = new TestStorage();
    expect(chooseStartupBackupPrompt(null, new Date('2026-05-08'), storage)).toBeNull();

    recordRecipeSaveAndChoosePrompt(null, new Date('2026-05-08'), storage);
    saveBackupMeta(
      {
        createdAt: '2026-03-01T00:00:00.000Z',
        encrypted: true,
        recipeCount: 1,
        ingredientCount: 1,
      },
      storage,
    );

    expect(chooseStartupBackupPrompt(loadBackupMeta(storage), new Date('2026-06-10'), storage)).toBe(
      'stale-backup',
    );
    expect(chooseStartupBackupPrompt(loadBackupMeta(storage), new Date('2026-06-11'), storage)).toBeNull();
  });
});

describe('deriveIosRiskLevel', () => {
  it('returns critical for iOS Safari without Home Screen install', () => {
    expect(deriveIosRiskLevel({ installMethod: 'ios-safari', standalone: false })).toBe('critical');
    expect(deriveIosRiskLevel({ installMethod: 'ios-chrome', standalone: false })).toBe('critical');
    expect(deriveIosRiskLevel({ installMethod: 'ios-other', standalone: false })).toBe('critical');
  });

  it('downgrades to low for installed iOS Home Screen PWAs', () => {
    expect(deriveIosRiskLevel({ installMethod: 'ios-safari', standalone: true })).toBe('low');
  });

  it('returns none for non-iOS browsers', () => {
    expect(deriveIosRiskLevel({ installMethod: 'one-tap', standalone: false })).toBe('none');
    expect(deriveIosRiskLevel({ installMethod: 'manual', standalone: false })).toBe('none');
    expect(deriveIosRiskLevel({ installMethod: 'manual', standalone: true })).toBe('none');
  });
});

describe('deriveStorageStatus', () => {
  it('treats memory mode and critical iOS risk as at-risk regardless of persistence', () => {
    expect(
      deriveStorageStatus({
        mode: 'memory',
        persisted: true,
        lastBackupAgeDays: 1,
        iosRiskLevel: 'none',
        warningLevel: 'none',
      }),
    ).toBe('at-risk');
    expect(
      deriveStorageStatus({
        mode: 'opfs',
        persisted: true,
        lastBackupAgeDays: 1,
        iosRiskLevel: 'critical',
        warningLevel: 'none',
      }),
    ).toBe('at-risk');
    expect(
      deriveStorageStatus({
        mode: 'opfs',
        persisted: true,
        lastBackupAgeDays: 1,
        iosRiskLevel: 'none',
        warningLevel: 'critical',
      }),
    ).toBe('at-risk');
  });

  it('promotes to safe only when persisted, recently backed up, and no iOS risk', () => {
    expect(
      deriveStorageStatus({
        mode: 'opfs',
        persisted: true,
        lastBackupAgeDays: 5,
        iosRiskLevel: 'none',
        warningLevel: 'none',
      }),
    ).toBe('safe');
  });

  it('demotes to protected-locally when there is no recent backup', () => {
    expect(
      deriveStorageStatus({
        mode: 'opfs',
        persisted: true,
        lastBackupAgeDays: null,
        iosRiskLevel: 'none',
        warningLevel: 'none',
      }),
    ).toBe('protected-locally');
    expect(
      deriveStorageStatus({
        mode: 'opfs',
        persisted: true,
        lastBackupAgeDays: 60,
        iosRiskLevel: 'none',
        warningLevel: 'none',
      }),
    ).toBe('protected-locally');
  });

  it('iOS low risk (installed PWA) downgrades a fresh backup from safe to protected-locally', () => {
    // Installed iOS PWA storage isn't iCloud-backed, so even with a
    // fresh local backup we still recommend keeping the backup current
    // — but it isn't "at risk". Falls through to protected-locally.
    expect(
      deriveStorageStatus({
        mode: 'opfs',
        persisted: true,
        lastBackupAgeDays: 1,
        iosRiskLevel: 'low',
        warningLevel: 'none',
      }),
    ).toBe('protected-locally');
  });

  it('falls back to only-on-this-device when persistence isn’t granted', () => {
    expect(
      deriveStorageStatus({
        mode: 'opfs',
        persisted: false,
        lastBackupAgeDays: 1,
        iosRiskLevel: 'none',
        warningLevel: 'none',
      }),
    ).toBe('only-on-this-device');
    expect(
      deriveStorageStatus({
        mode: 'opfs',
        persisted: null,
        lastBackupAgeDays: null,
        iosRiskLevel: 'none',
        warningLevel: 'none',
      }),
    ).toBe('only-on-this-device');
  });
});

describe('install nudge state', () => {
  it('shows the nudge once on iOS Safari, then suppresses after dismissal', () => {
    const storage = new TestStorage();
    expect(shouldNudgeInstall({ installMethod: 'ios-safari', standalone: false }, storage)).toBe(true);
    dismissInstallNudge(storage);
    expect(shouldNudgeInstall({ installMethod: 'ios-safari', standalone: false }, storage)).toBe(false);
    expect(storage.getItem(PROMPT_STATE_KEY)).toContain('"installNudgeDismissed":true');
  });

  it('never shows the nudge for installed PWAs or non-Safari iOS browsers', () => {
    const storage = new TestStorage();
    expect(shouldNudgeInstall({ installMethod: 'ios-safari', standalone: true }, storage)).toBe(false);
    // iOS Chrome / iOS Firefox: install steps differ from Safari and we
    // don't ship copy for them yet, so the nudge stays suppressed even
    // though the underlying iOS risk is still 'critical'.
    expect(shouldNudgeInstall({ installMethod: 'ios-chrome', standalone: false }, storage)).toBe(false);
    expect(shouldNudgeInstall({ installMethod: 'ios-other', standalone: false }, storage)).toBe(false);
  });

  it('never shows the nudge on non-iOS platforms', () => {
    const storage = new TestStorage();
    expect(shouldNudgeInstall({ installMethod: 'manual', standalone: false }, storage)).toBe(false);
    expect(shouldNudgeInstall({ installMethod: 'one-tap', standalone: false }, storage)).toBe(false);
  });

  it('dismiss is idempotent — repeated calls leave the flag set without rewriting', () => {
    const storage = new TestStorage();
    dismissInstallNudge(storage);
    const first = storage.getItem(PROMPT_STATE_KEY);
    dismissInstallNudge(storage);
    dismissInstallNudge(storage);
    expect(storage.getItem(PROMPT_STATE_KEY)).toBe(first);
  });
});

describe('persistence metadata', () => {
  it('reports false until something is recorded', () => {
    const storage = new TestStorage();
    expect(loadPersistenceMeta(storage)).toBeNull();
    expect(hasRequestedPersistence(storage)).toBe(false);
  });

  it('reads back what the runtime wrote, regardless of the granted flag', () => {
    const storage = new TestStorage();
    storage.setItem(
      PERSISTENCE_META_KEY,
      JSON.stringify({ requestedAt: '2026-05-08T10:00:00.000Z', granted: false }),
    );
    expect(loadPersistenceMeta(storage)).toEqual({
      requestedAt: '2026-05-08T10:00:00.000Z',
      granted: false,
    });
    expect(hasRequestedPersistence(storage)).toBe(true);
  });

  it('treats malformed metadata as never-requested so the next save retries', () => {
    const storage = new TestStorage();
    storage.setItem(PERSISTENCE_META_KEY, '{"requestedAt":42,"granted":"yes"}');
    expect(loadPersistenceMeta(storage)).toBeNull();
    expect(hasRequestedPersistence(storage)).toBe(false);
  });
});
