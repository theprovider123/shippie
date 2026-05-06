import { describe, expect, it } from 'bun:test';
import { MemoryLocalDb } from './runtime.ts';
import {
  createEntry,
  createMedication,
  createSymptom,
  deleteMedication,
  deleteSymptom,
  dosesInRange,
  entriesInRange,
  listEntries,
  listMedications,
  listSymptoms,
  recordMedDose,
  reorderSymptoms,
  updateMedication,
  updateSymptom,
} from './queries.ts';

describe('symptoms', () => {
  it('creates and lists symptoms in sort order', async () => {
    const db = new MemoryLocalDb();
    await createSymptom(db, { name: 'Pain', default_scale: '1-5' });
    await createSymptom(db, { name: 'Fatigue', default_scale: '1-5' });
    await createSymptom(db, { name: 'Nausea', default_scale: 'present-absent' });

    const all = await listSymptoms(db);
    expect(all).toHaveLength(3);
    expect(all.map((s) => s.name)).toEqual(['Pain', 'Fatigue', 'Nausea']);
    // sort_order should be 0, 1, 2
    expect(all.map((s) => s.sort_order)).toEqual([0, 1, 2]);
  });

  it('reorders symptoms by id', async () => {
    const db = new MemoryLocalDb();
    const a = await createSymptom(db, { name: 'A', default_scale: '1-5' });
    const b = await createSymptom(db, { name: 'B', default_scale: '1-5' });
    const c = await createSymptom(db, { name: 'C', default_scale: '1-5' });

    await reorderSymptoms(db, [c.id, a.id, b.id]);
    const ordered = await listSymptoms(db);
    expect(ordered.map((s) => s.name)).toEqual(['C', 'A', 'B']);
  });

  it('updates a symptom name and scale', async () => {
    const db = new MemoryLocalDb();
    const s = await createSymptom(db, { name: 'Pain', default_scale: '1-5' });
    await updateSymptom(db, s.id, { name: 'Joint pain' });
    const all = await listSymptoms(db);
    expect(all[0]!.name).toBe('Joint pain');
  });

  it('cascades entry deletes when a symptom is removed', async () => {
    const db = new MemoryLocalDb();
    const s = await createSymptom(db, { name: 'Headache', default_scale: '1-5' });
    await createEntry(db, { symptom_id: s.id, intensity: 4 });
    await createEntry(db, { symptom_id: s.id, intensity: 2 });
    expect(await listEntries(db)).toHaveLength(2);

    await deleteSymptom(db, s.id);
    expect(await listSymptoms(db)).toHaveLength(0);
    expect(await listEntries(db)).toHaveLength(0);
  });
});

describe('entries', () => {
  it('creates entries with explicit and default timestamps', async () => {
    const db = new MemoryLocalDb();
    const s = await createSymptom(db, { name: 'Pain', default_scale: '1-5' });
    const fixed = '2026-04-15T09:30:00.000Z';
    const e1 = await createEntry(db, { symptom_id: s.id, intensity: 3, occurred_at: fixed });
    expect(e1.occurred_at).toBe(fixed);

    const e2 = await createEntry(db, { symptom_id: s.id, intensity: 5, note: 'after wine' });
    expect(e2.occurred_at).toBeDefined();
    expect(e2.note).toBe('after wine');
  });

  it('queries entries within an inclusive ISO range', async () => {
    const db = new MemoryLocalDb();
    const s = await createSymptom(db, { name: 'Pain', default_scale: '1-5' });
    await createEntry(db, { symptom_id: s.id, intensity: 1, occurred_at: '2026-04-01T10:00:00Z' });
    await createEntry(db, { symptom_id: s.id, intensity: 3, occurred_at: '2026-04-15T10:00:00Z' });
    await createEntry(db, { symptom_id: s.id, intensity: 5, occurred_at: '2026-05-01T10:00:00Z' });

    const inRange = await entriesInRange(db, '2026-04-01T00:00:00Z', '2026-04-30T23:59:59Z');
    expect(inRange).toHaveLength(2);
    expect(inRange.map((e) => e.intensity)).toEqual([1, 3]);
  });

  it('lists entries newest-first', async () => {
    const db = new MemoryLocalDb();
    const s = await createSymptom(db, { name: 'Pain', default_scale: '1-5' });
    await createEntry(db, { symptom_id: s.id, intensity: 2, occurred_at: '2026-04-01T10:00:00Z' });
    await createEntry(db, { symptom_id: s.id, intensity: 4, occurred_at: '2026-04-10T10:00:00Z' });
    const all = await listEntries(db);
    expect(all[0]!.intensity).toBe(4);
  });
});

describe('medications + doses', () => {
  it('creates an active medication and toggles to archived', async () => {
    const db = new MemoryLocalDb();
    const med = await createMedication(db, { name: 'Naproxen', dose: '500mg', schedule_text: 'twice daily' });
    expect(med.active).toBe(1);

    let active = await listMedications(db, { activeOnly: true });
    expect(active).toHaveLength(1);

    await updateMedication(db, med.id, { active: 0 });
    active = await listMedications(db, { activeOnly: true });
    expect(active).toHaveLength(0);

    const all = await listMedications(db);
    expect(all).toHaveLength(1);
  });

  it('records a dose and queries by range', async () => {
    const db = new MemoryLocalDb();
    const med = await createMedication(db, { name: 'Hydroxychloroquine' });
    await recordMedDose(db, { medication_id: med.id, taken_at: '2026-04-10T08:00:00Z' });
    await recordMedDose(db, { medication_id: med.id, taken_at: '2026-04-11T08:00:00Z' });
    await recordMedDose(db, { medication_id: med.id, taken_at: '2026-05-01T08:00:00Z' });

    const inApr = await dosesInRange(db, '2026-04-01T00:00:00Z', '2026-04-30T23:59:59Z');
    expect(inApr).toHaveLength(2);
  });

  it('cascades dose history when a medication is deleted', async () => {
    const db = new MemoryLocalDb();
    const med = await createMedication(db, { name: 'Test' });
    await recordMedDose(db, { medication_id: med.id });
    await recordMedDose(db, { medication_id: med.id });
    await deleteMedication(db, med.id);
    expect(await listMedications(db)).toHaveLength(0);
    const remaining = await dosesInRange(db, '1970-01-01T00:00:00Z', '2099-12-31T23:59:59Z');
    expect(remaining).toHaveLength(0);
  });
});
