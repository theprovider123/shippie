import { describe, expect, it } from 'bun:test';
import * as Y from 'yjs';
import {
  addMember,
  createTripDoc,
  initMeta,
  localStopToShared,
  pinSharedStop,
  readMeta,
  readSharedStops,
} from './trip-doc.ts';

function sync(...docs: Y.Doc[]): void {
  for (const a of docs) {
    for (const b of docs) {
      if (a === b) continue;
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    }
  }
}

describe('trip-doc meta', () => {
  it('initMeta sets defaults; second call is a no-op', () => {
    const doc = createTripDoc();
    initMeta(doc, { name: 'Coast walk' });
    const first = readMeta(doc);
    expect(first.name).toBe('Coast walk');
    expect(first.started_on).toBeTruthy();

    initMeta(doc, { name: 'OVERWRITE ME', members: ['nope'] });
    const after = readMeta(doc);
    expect(after.name).toBe('Coast walk');
    expect(after.members).toEqual([]);
  });

  it('addMember dedupes', () => {
    const doc = createTripDoc();
    initMeta(doc, { name: 'x' });
    addMember(doc, 'peer-a');
    addMember(doc, 'peer-a');
    addMember(doc, 'peer-b');
    expect(readMeta(doc).members).toEqual(['peer-a', 'peer-b']);
  });
});

describe('trip-doc stops convergence', () => {
  it('two peers each pin a stop; both converge to the same list', () => {
    const a = createTripDoc();
    const b = createTripDoc();
    initMeta(a, { name: 'Joint hike' });
    sync(a, b);

    pinSharedStop(a, {
      id: 'stop-1',
      lat: 51.5, lon: -0.1,
      label: 'Trailhead',
      captured_at: '2026-05-05T08:00:00Z',
      pinned_by: 'a',
    });
    pinSharedStop(b, {
      id: 'stop-2',
      lat: 51.6, lon: -0.2,
      label: 'View',
      captured_at: '2026-05-05T11:00:00Z',
      pinned_by: 'b',
    });
    sync(a, b);

    const onA = readSharedStops(a).map((s) => s.id).sort();
    const onB = readSharedStops(b).map((s) => s.id).sort();
    expect(onA).toEqual(['stop-1', 'stop-2']);
    expect(onB).toEqual(['stop-1', 'stop-2']);
  });

  it('a stop pinned remotely is observable via update event', async () => {
    const a = createTripDoc();
    const b = createTripDoc();
    initMeta(a, { name: 'Watcher' });
    sync(a, b);

    let firedOn: 'a' | 'b' | null = null;
    a.on('update', () => {
      if (!firedOn) firedOn = 'a';
    });
    b.on('update', () => {
      if (!firedOn) firedOn = 'b';
    });

    pinSharedStop(b, {
      id: 'remote-1',
      lat: 0, lon: 0,
      captured_at: '2026-05-05T12:00:00Z',
    });
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    await Promise.resolve();
    expect(firedOn).not.toBeNull();
    expect(readSharedStops(a)).toHaveLength(1);
  });
});

describe('localStopToShared', () => {
  it('strips photo_id', () => {
    const shared = localStopToShared({
      id: 's1',
      trip_id: 't1',
      lat: 1, lon: 2,
      label: 'foo',
      captured_at: '2026-05-05T10:00:00Z',
      photo_id: 'photo-xyz',
      note: 'note',
    }, 'peer-1');
    expect(shared.id).toBe('s1');
    expect(shared.pinned_by).toBe('peer-1');
    // SharedStop type has no photo_id field at compile time; runtime check too:
    expect((shared as unknown as Record<string, unknown>).photo_id).toBeUndefined();
  });

  it('falls back to now() when captured_at is missing', () => {
    const shared = localStopToShared({
      id: 's', trip_id: 't', lat: 0, lon: 0,
    });
    expect(typeof shared.captured_at).toBe('string');
    expect(shared.captured_at.length).toBeGreaterThan(0);
  });
});
