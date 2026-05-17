import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import {
  ackHandoverNote,
  addHandoverNote,
  addMed,
  deactivateMed,
  logMedDose,
  logSymptom,
  readActiveMeds,
  readDosesForMed,
  readHandover,
  readMeds,
  readMeta,
  readPrefs,
  readSymptoms,
  readUnreadHandoverFor,
  setPrefField,
  setRecipientName,
} from './care-doc.ts';

function syncDocs(a: Y.Doc, b: Y.Doc): void {
  // Round-trip both directions so each doc has the other's state.
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
}

describe('care-doc — basic writes + reads', () => {
  test('addMed → readActiveMeds picks it up', () => {
    const doc = new Y.Doc();
    addMed(doc, { name: 'Calpol', dose: '5ml', schedule_text: 'every 4 hours' });
    expect(readActiveMeds(doc).length).toBe(1);
    expect(readActiveMeds(doc)[0]?.name).toBe('Calpol');
  });

  test('deactivateMed flips active=false; readMeds still shows; readActiveMeds excludes', () => {
    const doc = new Y.Doc();
    const m = addMed(doc, { name: 'Calpol', dose: '5ml', schedule_text: 'every 4 hours' });
    deactivateMed(doc, m.id);
    expect(readMeds(doc).length).toBe(1);
    expect(readActiveMeds(doc).length).toBe(0);
  });

  test('logMedDose then readDosesForMed returns the dose', () => {
    const doc = new Y.Doc();
    const m = addMed(doc, { name: 'Calpol', dose: '5ml', schedule_text: 'morning' });
    logMedDose(doc, m.id, 'a', 'gave Mum her morning dose at 9:42');
    const doses = readDosesForMed(doc, m.id);
    expect(doses.length).toBe(1);
    expect(doses[0]?.given_by).toBe('a');
    expect(doses[0]?.note).toBe('gave Mum her morning dose at 9:42');
  });

  test('logSymptom and readSymptoms', () => {
    const doc = new Y.Doc();
    logSymptom(doc, { label: 'headache', intensity: 4 }, 'a');
    const ss = readSymptoms(doc);
    expect(ss.length).toBe(1);
    expect(ss[0]?.label).toBe('headache');
    expect(ss[0]?.intensity).toBe(4);
  });

  test('addHandoverNote and ack — never deletable', () => {
    const doc = new Y.Doc();
    const n = addHandoverNote(doc, 'a', 'GP appointment Friday');
    expect(n).not.toBeNull();
    expect(readHandover(doc).length).toBe(1);

    // The author CANNOT ack their own note.
    ackHandoverNote(doc, n!.id, 'a');
    expect(readHandover(doc)[0]?.acked_at).toBeNull();

    // The other caregiver acks it.
    ackHandoverNote(doc, n!.id, 'b');
    expect(readHandover(doc)[0]?.acked_at).not.toBeNull();

    // Ack does NOT delete — entry survives.
    expect(readHandover(doc).length).toBe(1);
  });

  test('readUnreadHandoverFor excludes own + acked entries', () => {
    const doc = new Y.Doc();
    const n1 = addHandoverNote(doc, 'a', 'one');
    const n2 = addHandoverNote(doc, 'b', 'two');
    expect(readUnreadHandoverFor(doc, 'b').length).toBe(1); // sees n1
    expect(readUnreadHandoverFor(doc, 'a').length).toBe(1); // sees n2
    ackHandoverNote(doc, n1!.id, 'b');
    expect(readUnreadHandoverFor(doc, 'b').length).toBe(0);
    void n2;
  });
});

describe('care-doc — meta + prefs', () => {
  test('setRecipientName + readMeta', () => {
    const doc = new Y.Doc();
    setRecipientName(doc, '  Mum  ');
    expect(readMeta(doc).recipient_name).toBe('Mum');
  });

  test('setPrefField + readPrefs', () => {
    const doc = new Y.Doc();
    setPrefField(doc, 'recipient_view', 'summary');
    expect(readPrefs(doc).recipient_view).toBe('summary');
  });
});

describe('care-doc — Yjs merge across two docs (mesh shape)', () => {
  test('A adds a med, B sees it after sync', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    addMed(a, { name: 'Calpol', dose: '5ml', schedule_text: 'every 4 hours' });
    syncDocs(a, b);
    expect(readMeds(b).length).toBe(1);
    expect(readMeds(b)[0]?.name).toBe('Calpol');
  });

  test('A logs a dose; B sees it after sync', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const m = addMed(a, { name: 'Calpol', dose: '5ml', schedule_text: 'morning' });
    syncDocs(a, b);
    logMedDose(a, m.id, 'a', 'morning dose');
    syncDocs(a, b);
    expect(readDosesForMed(b, m.id).length).toBe(1);
    expect(readDosesForMed(b, m.id)[0]?.note).toBe('morning dose');
  });

  test('B writes a handover; A acks; both ends agree', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const n = addHandoverNote(b, 'b', 'GP appointment Friday');
    syncDocs(a, b);
    expect(readHandover(a).length).toBe(1);
    ackHandoverNote(a, n!.id, 'a');
    syncDocs(a, b);
    expect(readHandover(b)[0]?.acked_at).not.toBeNull();
    expect(readHandover(a)[0]?.acked_at).not.toBeNull();
  });

  test('Concurrent writes both survive (CRDT merge)', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    // Both sides write before sync.
    logSymptom(a, { label: 'headache', intensity: 3 }, 'a');
    logSymptom(b, { label: 'nausea', intensity: 2 }, 'b');
    syncDocs(a, b);
    expect(readSymptoms(a).length).toBe(2);
    expect(readSymptoms(b).length).toBe(2);
  });
});
