import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearInbox,
  listInbox,
  markAllRead,
  markRead,
  pushToInbox,
  unreadCount,
} from './notification-inbox';
import { DEFAULT_PREFERENCES, type SystemPreferences } from './preferences';

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

const prefs: SystemPreferences = { ...DEFAULT_PREFERENCES, quietHoursStart: '22:00', quietHoursEnd: '07:00' };

describe('notification inbox', () => {
  let storage: Storage;
  beforeEach(() => {
    storage = fakeStorage();
  });

  it('starts empty', () => {
    expect(listInbox(storage)).toEqual([]);
    expect(unreadCount(storage)).toBe(0);
  });

  it('pushToInbox stores newest-first', () => {
    pushToInbox({ id: 'a', appSlug: 'recipe', title: 'Saved', ts: 100 }, { storage });
    pushToInbox({ id: 'b', appSlug: 'recipe', title: 'Cooked', ts: 200 }, { storage });
    const all = listInbox(storage);
    expect(all.map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('marks Quiet Hours suppression based on current clock', () => {
    const recOff = pushToInbox(
      { id: '1', appSlug: 'r', title: 't', ts: 100 },
      { storage, prefs, now: () => new Date(2026, 5, 30, 12, 0) },
    );
    const recOn = pushToInbox(
      { id: '2', appSlug: 'r', title: 't', ts: 200 },
      { storage, prefs, now: () => new Date(2026, 5, 30, 23, 0) },
    );
    expect(recOff.suppressedByQuietHours).toBe(false);
    expect(recOn.suppressedByQuietHours).toBe(true);
  });

  it('markRead flips one row', () => {
    pushToInbox({ id: 'a', appSlug: 'r', title: 't', ts: 1 }, { storage });
    pushToInbox({ id: 'b', appSlug: 'r', title: 't', ts: 2 }, { storage });
    markRead('a', storage);
    const all = listInbox(storage);
    expect(all.find((n) => n.id === 'a')!.read).toBe(true);
    expect(all.find((n) => n.id === 'b')!.read).toBe(false);
  });

  it('markAllRead flips every row', () => {
    pushToInbox({ id: 'a', appSlug: 'r', title: 't', ts: 1 }, { storage });
    pushToInbox({ id: 'b', appSlug: 'r', title: 't', ts: 2 }, { storage });
    markAllRead(storage);
    expect(unreadCount(storage)).toBe(0);
  });

  it('clearInbox empties everything', () => {
    pushToInbox({ id: 'a', appSlug: 'r', title: 't', ts: 1 }, { storage });
    clearInbox(storage);
    expect(listInbox(storage)).toEqual([]);
  });

  it('unreadCount tracks unread rows', () => {
    pushToInbox({ id: 'a', appSlug: 'r', title: 't', ts: 1 }, { storage });
    pushToInbox({ id: 'b', appSlug: 'r', title: 't', ts: 2 }, { storage });
    pushToInbox({ id: 'c', appSlug: 'r', title: 't', ts: 3 }, { storage });
    markRead('b', storage);
    expect(unreadCount(storage)).toBe(2);
  });

  it('caps the inbox at 200 entries', () => {
    for (let i = 0; i < 220; i++) {
      pushToInbox({ id: `n-${i}`, appSlug: 'r', title: 't', ts: i }, { storage });
    }
    expect(listInbox(storage)).toHaveLength(200);
  });
});
