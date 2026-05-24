import { beforeEach, describe, expect, test } from 'bun:test';
import {
  addGroupEvent,
  clearGroupEvents,
  getOrCreateSourceId,
  listGroupEvents,
  MAX_EVENTS,
} from './group-events';

function installFakeLocalStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    },
  });
}

describe('group-events', () => {
  beforeEach(() => installFakeLocalStorage());

  test('addGroupEvent + listGroupEvents round-trip', () => {
    const event = addGroupEvent({
      kind: 'group_signal',
      source_id: 'me',
      display_name: 'Me',
      supporter_tag: 'K7P4',
      preset: 'on_my_way',
    });
    const rows = listGroupEvents();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(event.id);
    expect(rows[0]?.preset).toBe('on_my_way');
    expect(rows[0]?.supporter_tag).toBe('K7P4');
    expect(rows[0]?.ttl_minutes).toBe(180);
  });

  test('listGroupEvents prunes expired rows', () => {
    const past = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 h ago — beyond 180 min TTL
    const fresh = addGroupEvent({
      kind: 'group_signal',
      source_id: 'me',
      display_name: 'Me',
      preset: 'see_bus',
    });
    // Inject an expired event directly into storage
    const expired = {
      id: 'expired',
      kind: 'group_signal' as const,
      source_id: 'me',
      display_name: 'Me',
      preset: 'lost_signal' as const,
      created_at: past.toISOString(),
      ttl_minutes: 60,
    };
    localStorage.setItem(
      'parade-companion:group-events',
      JSON.stringify([expired, fresh]),
    );
    const rows = listGroupEvents();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(fresh.id);
  });

  test('cap enforced at MAX_EVENTS', () => {
    for (let i = 0; i < MAX_EVENTS + 5; i += 1) {
      addGroupEvent({
        kind: 'group_signal',
        source_id: 'me',
        display_name: 'Me',
        preset: 'hold_tight',
      });
    }
    expect(listGroupEvents()).toHaveLength(MAX_EVENTS);
  });

  test('clear removes everything', () => {
    addGroupEvent({ kind: 'group_signal', source_id: 'me', display_name: 'Me', preset: 'im_okay' });
    expect(listGroupEvents()).toHaveLength(1);
    clearGroupEvents();
    expect(listGroupEvents()).toHaveLength(0);
  });

  test('getOrCreateSourceId is stable across calls', () => {
    const a = getOrCreateSourceId();
    const b = getOrCreateSourceId();
    expect(a).toBe(b);
    expect(a.startsWith('me_')).toBe(true);
  });
});
