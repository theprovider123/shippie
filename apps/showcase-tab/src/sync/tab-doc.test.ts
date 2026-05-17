import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import {
  addItem,
  announceMember,
  ensureMeta,
  getItems,
  getSettlements,
  listMembers,
  readMeta,
  recordSettlement,
  removeItem,
  updateMeta,
} from './tab-doc.ts';

function sync(...docs: Y.Doc[]): void {
  for (const a of docs) {
    for (const b of docs) {
      if (a === b) continue;
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    }
  }
}

describe('tab-doc — meta', () => {
  test('ensureMeta seeds defaults on first call, no-op afterwards', () => {
    const doc = new Y.Doc();
    const m1 = ensureMeta(doc, { currency: 'GBP', label: 'Dinner Friday' });
    expect(m1.currency).toBe('GBP');
    expect(m1.label).toBe('Dinner Friday');
    const m2 = ensureMeta(doc, { currency: 'EUR', label: 'Lisbon trip' });
    // Defaults didn't override the existing meta.
    expect(m2.currency).toBe('GBP');
    expect(m2.label).toBe('Dinner Friday');
  });

  test('updateMeta patches selected fields', () => {
    const doc = new Y.Doc();
    ensureMeta(doc, { currency: 'GBP', label: 'Dinner Friday' });
    updateMeta(doc, { currency: 'EUR' });
    const m = readMeta(doc)!;
    expect(m.currency).toBe('EUR');
    expect(m.label).toBe('Dinner Friday'); // untouched
  });
});

describe('tab-doc — members', () => {
  test('announceMember writes idempotently and ordering is by joined_at', () => {
    const doc = new Y.Doc();
    announceMember(doc, 'sara', 'Sara');
    announceMember(doc, 'sara', 'Sara'); // no-op
    announceMember(doc, 'tom', 'Tom');
    const ms = listMembers(doc);
    expect(ms.length).toBe(2);
    expect(ms[0]!.id).toBe('sara');
    expect(ms[1]!.id).toBe('tom');
  });

  test('rename preserves joined_at', () => {
    const doc = new Y.Doc();
    announceMember(doc, 'sara', 'Sara');
    const before = listMembers(doc)[0]!.member.joined_at;
    announceMember(doc, 'sara', 'Sara V.');
    const after = listMembers(doc)[0]!.member;
    expect(after.name).toBe('Sara V.');
    expect(after.joined_at).toBe(before);
  });
});

describe('tab-doc — items', () => {
  test('add and remove items', () => {
    const doc = new Y.Doc();
    const i = addItem(doc, { label: 'wine', amount_cents: 1500, paid_by: 'sara' });
    expect(getItems(doc).length).toBe(1);
    removeItem(doc, i.id);
    expect(getItems(doc).length).toBe(0);
  });

  test('items added by different members on different docs merge cleanly', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    addItem(a, { label: 'starters', amount_cents: 1800, paid_by: 'sara' });
    addItem(b, { label: 'wine', amount_cents: 2400, paid_by: 'tom' });
    sync(a, b);
    const labelsA = getItems(a).toArray().map((i) => i.label).sort();
    const labelsB = getItems(b).toArray().map((i) => i.label).sort();
    expect(labelsA).toEqual(['starters', 'wine']);
    expect(labelsB).toEqual(['starters', 'wine']);
  });

  test('amount_cents is rounded to integer on add', () => {
    const doc = new Y.Doc();
    const i = addItem(doc, { label: 'x', amount_cents: 12.4, paid_by: 'a' });
    expect(i.amount_cents).toBe(12);
  });
});

describe('tab-doc — settlements', () => {
  test('settlements append and merge across docs', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    recordSettlement(a, { from: 'tom', to: 'sara', amount_cents: 1500 });
    recordSettlement(b, { from: 'jo', to: 'sara', amount_cents: 600 });
    sync(a, b);
    const fromsA = getSettlements(a).toArray().map((s) => s.from).sort();
    const fromsB = getSettlements(b).toArray().map((s) => s.from).sort();
    expect(fromsA).toEqual(['jo', 'tom']);
    expect(fromsB).toEqual(['jo', 'tom']);
  });
});
