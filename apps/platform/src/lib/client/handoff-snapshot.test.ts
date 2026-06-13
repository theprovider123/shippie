import { describe, expect, test } from 'vitest';
import {
  applyHandoffSnapshot,
  buildHandoffSnapshot,
  curatedAppId,
  isHandoffSnapshot,
  readLocalAppRows,
  readLocalDock,
  type StorageLike,
} from './handoff-snapshot';

function fakeStorage(seed: Record<string, string> = {}): StorageLike & { dump(): Record<string, string> } {
  const store = { ...seed };
  return {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; },
    dump: () => store,
  };
}

const LAUNCHER = 'shippie:launcher:v1';
const CONTAINER = 'shippie.container.v1';

describe('handoff snapshot', () => {
  test('curatedAppId mirrors state.ts (dashes → underscores)', () => {
    expect(curatedAppId('golazo')).toBe('app_golazo');
    expect(curatedAppId('match-room')).toBe('app_match_room');
  });

  test('reads dock + app rows from the local blobs', () => {
    const storage = fakeStorage({
      [LAUNCHER]: JSON.stringify({ saved: ['palate', 'golazo'] }),
      [CONTAINER]: JSON.stringify({ rowsByApp: { app_palate: [{ id: 1 }, { id: 2 }] } }),
    });
    expect(readLocalDock(storage)).toEqual(['palate', 'golazo']);
    expect(readLocalAppRows(storage, 'palate')).toEqual([{ id: 1 }, { id: 2 }]);
    expect(readLocalAppRows(storage, 'golazo')).toEqual([]);
  });

  test('build → apply moves dock + rows to a fresh device', () => {
    const phone = fakeStorage({
      [LAUNCHER]: JSON.stringify({ saved: ['palate', 'golazo'] }),
      [CONTAINER]: JSON.stringify({ rowsByApp: { app_palate: [{ id: 1 }] } }),
    });
    const snapshot = buildHandoffSnapshot(phone, { appSlug: 'palate', createdAt: '2026-06-13T00:00:00Z' });
    expect(isHandoffSnapshot(snapshot)).toBe(true);
    expect(snapshot.dock).toEqual(['palate', 'golazo']);
    expect(snapshot.app).toEqual({ slug: 'palate', rows: [{ id: 1 }] });

    const laptop = fakeStorage({ [LAUNCHER]: JSON.stringify({ saved: ['coffee'] }) });
    const result = applyHandoffSnapshot(laptop, snapshot);
    expect(result.dock).toEqual(['palate', 'golazo', 'coffee']); // incoming first, then local, deduped
    expect(result.appRestored).toBe('palate');
    expect(JSON.parse(laptop.dump()[LAUNCHER]).saved).toEqual(['palate', 'golazo', 'coffee']);
    expect(JSON.parse(laptop.dump()[CONTAINER]).rowsByApp.app_palate).toEqual([{ id: 1 }]);
  });

  test('dock-only snapshot (no app) applies cleanly', () => {
    const snapshot = buildHandoffSnapshot(
      fakeStorage({ [LAUNCHER]: JSON.stringify({ saved: ['palate'] }) }),
      { createdAt: '2026-06-13T00:00:00Z' },
    );
    expect(snapshot.app).toBeUndefined();
    const laptop = fakeStorage();
    const result = applyHandoffSnapshot(laptop, snapshot);
    expect(result.appRestored).toBeNull();
    expect(result.dock).toEqual(['palate']);
  });

  test('isHandoffSnapshot rejects malformed payloads', () => {
    expect(isHandoffSnapshot(null)).toBe(false);
    expect(isHandoffSnapshot({ schema: 'wrong', dock: [] })).toBe(false);
    expect(isHandoffSnapshot({ schema: 'shippie.handoff.v1', dock: 'x' })).toBe(false);
    expect(isHandoffSnapshot({ schema: 'shippie.handoff.v1', dock: ['a'], app: { slug: 'x' } })).toBe(false);
    expect(isHandoffSnapshot({ schema: 'shippie.handoff.v1', dock: ['a'] })).toBe(true);
  });
});
