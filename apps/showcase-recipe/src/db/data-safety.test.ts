import { describe, expect, it } from 'bun:test';
import {
  BACKUP_META_KEY,
  PROMPT_STATE_KEY,
  chooseStartupBackupPrompt,
  loadBackupMeta,
  recordRecipeSaveAndChoosePrompt,
  saveBackupMeta,
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
