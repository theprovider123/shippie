import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_SETTINGS,
  deleteMemo,
  getMemo,
  insertMemo,
  loadMemos,
  loadSettings,
  memosWithTag,
  newId,
  saveMemos,
  saveSettings,
  tagsSummary,
  updateMemo,
  type Memo,
  type Settings,
} from './store.ts';

function memStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(k) {
      return store.has(k) ? (store.get(k) as string) : null;
    },
    key(i) {
      return Array.from(store.keys())[i] ?? null;
    },
    removeItem(k) {
      store.delete(k);
    },
    setItem(k, v) {
      store.set(k, v);
    },
  };
}

function fixture(id: string, overrides: Partial<Memo> = {}): Memo {
  return {
    id,
    title: `memo ${id}`,
    transcript: `transcript ${id}`,
    segments: [],
    language: 'en',
    duration_s: 14,
    tags: [],
    edited: false,
    audio_ext: 'webm',
    recorded_at: '2026-05-01T12:00:00Z',
    ...overrides,
  };
}

describe('store · memos round-trip', () => {
  test('save then load returns the same list', () => {
    const storage = memStorage();
    const memos = [fixture('a'), fixture('b')];
    saveMemos(memos, storage);
    expect(loadMemos(storage)).toEqual(memos);
  });

  test('load returns [] when nothing is persisted', () => {
    expect(loadMemos(memStorage())).toEqual([]);
  });

  test('load returns [] on malformed JSON', () => {
    const storage = memStorage();
    storage.setItem('shippie.voice-memo.v1', 'not-json');
    expect(loadMemos(storage)).toEqual([]);
  });
});

describe('store · CRUD helpers', () => {
  test('insertMemo prepends and dedupes by id', () => {
    let memos: Memo[] = [];
    memos = insertMemo(memos, fixture('a'));
    memos = insertMemo(memos, fixture('b'));
    memos = insertMemo(memos, fixture('a', { transcript: 'updated' }));
    expect(memos.map((m) => m.id)).toEqual(['a', 'b']);
    expect(memos[0]?.transcript).toBe('updated');
  });

  test('updateMemo patches the matching id', () => {
    const memos = [fixture('a'), fixture('b')];
    const next = updateMemo(memos, 'b', { transcript: 'edited', edited: true });
    expect(next[1]?.transcript).toBe('edited');
    expect(next[1]?.edited).toBe(true);
    expect(next[0]?.transcript).toBe('transcript a');
  });

  test('deleteMemo removes the matching id', () => {
    const memos = [fixture('a'), fixture('b')];
    expect(deleteMemo(memos, 'a').map((m) => m.id)).toEqual(['b']);
  });

  test('getMemo returns null for missing ids', () => {
    expect(getMemo([fixture('a')], 'missing')).toBeNull();
    expect(getMemo([fixture('a')], 'a')?.id).toBe('a');
  });
});

describe('store · tags', () => {
  test('memosWithTag is case-insensitive and ignores whitespace', () => {
    const memos = [
      fixture('a', { tags: ['Errands', 'Family'] }),
      fixture('b', { tags: ['family'] }),
      fixture('c', { tags: ['shippie'] }),
    ];
    expect(memosWithTag(memos, 'FAMILY').map((m) => m.id)).toEqual(['a', 'b']);
    expect(memosWithTag(memos, '  family  ').map((m) => m.id)).toEqual(['a', 'b']);
    expect(memosWithTag(memos, '')).toEqual([]);
  });

  test('tagsSummary sorts by count desc, then alpha', () => {
    const memos = [
      fixture('a', { tags: ['Errands', 'Family'] }),
      fixture('b', { tags: ['family'] }),
      fixture('c', { tags: ['shippie'] }),
    ];
    const summary = tagsSummary(memos);
    expect(summary[0]).toEqual({ tag: 'family', count: 2 });
    expect(summary[1]?.tag).toBe('errands');
    expect(summary[2]?.tag).toBe('shippie');
  });
});

describe('store · settings', () => {
  test('default settings load when nothing persisted', () => {
    expect(loadSettings(memStorage())).toEqual(DEFAULT_SETTINGS);
  });

  test('settings round-trip', () => {
    const storage = memStorage();
    const next: Settings = { language: 'es', max_duration_ms: 120_000 };
    saveSettings(next, storage);
    expect(loadSettings(storage)).toEqual(next);
  });

  test('malformed settings fall back to defaults', () => {
    const storage = memStorage();
    storage.setItem('shippie.voice-memo.settings.v1', '{}');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('store · newId', () => {
  test('returns prefixed unique ids', () => {
    const a = newId();
    const b = newId();
    expect(a.startsWith('memo_')).toBe(true);
    expect(a).not.toBe(b);
  });

  test('honours custom prefixes', () => {
    expect(newId('blob').startsWith('blob_')).toBe(true);
  });
});
