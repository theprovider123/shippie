import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import {
  addChore,
  addFridgeItem,
  announceMember,
  getChores,
  getDinnerHistory,
  getFridge,
  getRota,
  listMembers,
  markChoreDone,
  recordDinner,
  removeFridgeItem,
  setRotaMembers,
} from './hearth-doc.ts';

function sync(...docs: Y.Doc[]): void {
  for (const a of docs) {
    for (const b of docs) {
      if (a === b) continue;
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    }
  }
}

describe('hearth-doc — chore rota', () => {
  test('adding a chore creates matching rota entry', () => {
    const doc = new Y.Doc();
    const chore = addChore(doc, {
      label: 'Bins',
      cadence: 'weekly',
      rotaMembers: ['m1', 'm2'],
    });
    expect(getChores(doc).length).toBe(1);
    const rota = getRota(doc).get(chore.id);
    expect(rota).toBeDefined();
    expect(rota?.members).toEqual(['m1', 'm2']);
    expect(rota?.cursor).toBe(0);
  });

  test('markChoreDone advances rota cursor by 1 mod length', () => {
    const doc = new Y.Doc();
    const chore = addChore(doc, {
      label: 'Hoover',
      cadence: 'weekly',
      rotaMembers: ['alex', 'sam', 'jo'],
    });
    markChoreDone(doc, chore.id, 'alex');
    expect(getRota(doc).get(chore.id)?.cursor).toBe(1);
    markChoreDone(doc, chore.id, 'sam');
    expect(getRota(doc).get(chore.id)?.cursor).toBe(2);
    markChoreDone(doc, chore.id, 'jo');
    expect(getRota(doc).get(chore.id)?.cursor).toBe(0); // wraps
  });

  test('markChoreDone updates last_done_at + last_done_by on the chore', () => {
    const doc = new Y.Doc();
    const chore = addChore(doc, {
      label: 'Bathroom',
      cadence: 'weekly',
      rotaMembers: ['a', 'b'],
    });
    markChoreDone(doc, chore.id, 'a', 12345);
    const updated = getChores(doc).toArray().find((c) => c.id === chore.id);
    expect(updated?.last_done_at).toBe(12345);
    expect(updated?.last_done_by).toBe('a');
    expect(updated?.rota_index).toBe(1);
  });

  test('setRotaMembers replaces rota and clamps cursor', () => {
    const doc = new Y.Doc();
    const chore = addChore(doc, {
      label: 'Recycling',
      cadence: 'weekly',
      rotaMembers: ['a', 'b', 'c'],
    });
    markChoreDone(doc, chore.id, 'a');
    markChoreDone(doc, chore.id, 'b');
    expect(getRota(doc).get(chore.id)?.cursor).toBe(2);
    // Reduce rota to two members; cursor must clamp into bounds.
    setRotaMembers(doc, chore.id, ['a', 'b']);
    const rota = getRota(doc).get(chore.id);
    expect(rota?.members).toEqual(['a', 'b']);
    expect(rota?.cursor).toBeLessThanOrEqual(1);
  });

  test('two housemates can edit chores concurrently and converge', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    addChore(a, { label: 'Bins', cadence: 'weekly', rotaMembers: ['m1', 'm2'] });
    sync(a, b);
    addChore(b, { label: 'Hoover', cadence: 'weekly', rotaMembers: ['m1', 'm2'] });
    sync(a, b);
    expect(getChores(a).length).toBe(2);
    expect(getChores(b).length).toBe(2);
  });
});

describe('hearth-doc — fridge', () => {
  test('add and remove fridge items', () => {
    const doc = new Y.Doc();
    const item = addFridgeItem(doc, { label: 'leek', qty_text: 'half', added_by: 'm1' });
    expect(getFridge(doc).length).toBe(1);
    removeFridgeItem(doc, item.id);
    expect(getFridge(doc).length).toBe(0);
  });

  test('two housemates can add fridge items concurrently — both survive merge', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    addFridgeItem(a, { label: 'leek', qty_text: 'half', added_by: 'a' });
    addFridgeItem(b, { label: 'eggs', qty_text: '6', added_by: 'b' });
    sync(a, b);
    const labelsA = getFridge(a).toArray().map((i) => i.label).sort();
    const labelsB = getFridge(b).toArray().map((i) => i.label).sort();
    expect(labelsA).toEqual(['eggs', 'leek']);
    expect(labelsB).toEqual(['eggs', 'leek']);
  });

  test('qty_text stays free-text — not parsed', () => {
    const doc = new Y.Doc();
    addFridgeItem(doc, { label: 'leek', qty_text: 'half a leek', added_by: 'm1' });
    expect(getFridge(doc).get(0)?.qty_text).toBe('half a leek');
  });
});

describe('hearth-doc — dinner history', () => {
  test('records a dinner', () => {
    const doc = new Y.Doc();
    const entry = recordDinner(doc, { label: 'Pasta', who_cooked: 'm1' });
    expect(getDinnerHistory(doc).length).toBe(1);
    expect(entry.who_cooked).toBe('m1');
  });

  test('dedup: same label + same calendar day is a no-op', () => {
    const doc = new Y.Doc();
    const morning = new Date('2026-05-01T09:00:00').getTime();
    const evening = new Date('2026-05-01T20:00:00').getTime();
    recordDinner(doc, { label: 'Pasta', eaten_at: morning });
    recordDinner(doc, { label: 'pasta', eaten_at: evening }); // case-insensitive
    expect(getDinnerHistory(doc).length).toBe(1);
  });

  test('same label, different days → two entries', () => {
    const doc = new Y.Doc();
    recordDinner(doc, { label: 'Pasta', eaten_at: new Date('2026-05-01T20:00:00').getTime() });
    recordDinner(doc, { label: 'Pasta', eaten_at: new Date('2026-05-02T20:00:00').getTime() });
    expect(getDinnerHistory(doc).length).toBe(2);
  });
});

describe('hearth-doc — members presence', () => {
  test('announceMember writes a row idempotently', () => {
    const doc = new Y.Doc();
    announceMember(doc, 'm1', 'Alex');
    announceMember(doc, 'm1', 'Alex'); // no-op
    announceMember(doc, 'm2', 'Sam');
    expect(listMembers(doc).length).toBe(2);
  });

  test('rename updates the existing row, preserves joined_at', () => {
    const doc = new Y.Doc();
    announceMember(doc, 'm1', 'Alex');
    const before = listMembers(doc)[0]!.member.joined_at;
    announceMember(doc, 'm1', 'Alexandra');
    const after = listMembers(doc).find((r) => r.id === 'm1')!.member;
    expect(after.name).toBe('Alexandra');
    expect(after.joined_at).toBe(before);
  });
});
