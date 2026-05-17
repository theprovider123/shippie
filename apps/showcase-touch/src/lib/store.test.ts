import { describe, expect, test } from 'bun:test';
import { MemoryLocalDb } from '../db/runtime.ts';
import {
  archivePerson,
  completeTask,
  createPerson,
  createTag,
  createTask,
  deletePerson,
  getPerson,
  listPeople,
  listTags,
  listTasksFor,
  listTouchesFor,
  logTouch,
  setPersonTags,
  tagsForPerson,
  updatePerson,
} from './store.ts';

describe('store · CRUD across tables', () => {
  test('create + list + get a person', async () => {
    const db = new MemoryLocalDb();
    const ada = await createPerson(db, { name: 'Ada Lovelace', cadence_days: 30 });
    expect(ada.id).toMatch(/^p_/);
    const all = await listPeople(db);
    expect(all).toHaveLength(1);
    expect(all[0]?.name).toBe('Ada Lovelace');
    const got = await getPerson(db, ada.id);
    expect(got?.cadence_days).toBe(30);
  });

  test('updatePerson patches fields without losing others', async () => {
    const db = new MemoryLocalDb();
    const p = await createPerson(db, { name: 'Bea', role: 'CTO', company: 'Acme' });
    await updatePerson(db, p.id, { role: 'CEO' });
    const after = await getPerson(db, p.id);
    expect(after?.role).toBe('CEO');
    expect(after?.company).toBe('Acme');
  });

  test('archivePerson sets archived=1 (does not delete)', async () => {
    const db = new MemoryLocalDb();
    const p = await createPerson(db, { name: 'Cy' });
    await archivePerson(db, p.id);
    const after = await getPerson(db, p.id);
    expect(after?.archived).toBe(1);
  });

  test('logTouch writes touch row, updates last/next_touch_at', async () => {
    const db = new MemoryLocalDb();
    const p = await createPerson(db, { name: 'Dee', cadence_days: 30 });
    const happened_at = '2026-04-01T12:00:00.000Z';
    const t = await logTouch(db, {
      person_id: p.id,
      kind: 'coffee',
      summary: 'King\'s Head, talked roadmap',
      sentiment: '+',
      happened_at,
    });
    expect(t.id).toMatch(/^t_/);
    const after = await getPerson(db, p.id);
    expect(after?.last_touch_at).toBe(happened_at);
    expect(after?.next_touch_at).toBe('2026-05-01T12:00:00.000Z');
    const touches = await listTouchesFor(db, p.id);
    expect(touches).toHaveLength(1);
    expect(touches[0]?.summary).toContain('King');
  });

  test('logTouch newest-first ordering on listTouchesFor', async () => {
    const db = new MemoryLocalDb();
    const p = await createPerson(db, { name: 'Ed' });
    await logTouch(db, {
      person_id: p.id,
      kind: 'note',
      happened_at: '2026-01-01T00:00:00.000Z',
    });
    await logTouch(db, {
      person_id: p.id,
      kind: 'note',
      happened_at: '2026-04-01T00:00:00.000Z',
    });
    const touches = await listTouchesFor(db, p.id);
    expect(touches[0]?.happened_at).toBe('2026-04-01T00:00:00.000Z');
  });

  test('tags + person_tags many-to-many round-trips', async () => {
    const db = new MemoryLocalDb();
    const ada = await createPerson(db, { name: 'Ada' });
    const inner = await createTag(db, 'inner-circle');
    const eu = await createTag(db, 'EU');
    await setPersonTags(db, ada.id, [inner.id, eu.id]);
    const tags = await tagsForPerson(db, ada.id);
    expect(tags.map((t) => t.label).sort()).toEqual(['EU', 'inner-circle']);
    // remove one
    await setPersonTags(db, ada.id, [inner.id]);
    const after = await tagsForPerson(db, ada.id);
    expect(after.map((t) => t.label)).toEqual(['inner-circle']);
  });

  test('createTag is case-insensitive idempotent', async () => {
    const db = new MemoryLocalDb();
    const a = await createTag(db, 'EU');
    const b = await createTag(db, '  eu  ');
    expect(a.id).toBe(b.id);
    expect((await listTags(db))).toHaveLength(1);
  });

  test('tasks: create / complete / list', async () => {
    const db = new MemoryLocalDb();
    const p = await createPerson(db, { name: 'Fae' });
    const task = await createTask(db, {
      person_id: p.id,
      body: 'send the spreadsheet',
      due_at: '2026-05-10T00:00:00.000Z',
    });
    const list = await listTasksFor(db, p.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.done_at).toBeNull();
    await completeTask(db, task.id);
    const after = await listTasksFor(db, p.id);
    expect(after[0]?.done_at).not.toBeNull();
  });

  test('deletePerson cascades touches/tasks/tags', async () => {
    const db = new MemoryLocalDb();
    const p = await createPerson(db, { name: 'Gee' });
    await logTouch(db, { person_id: p.id, kind: 'note' });
    const tag = await createTag(db, 'family');
    await setPersonTags(db, p.id, [tag.id]);
    await createTask(db, { person_id: p.id, body: 'call mum', due_at: null });
    await deletePerson(db, p.id);
    expect(await getPerson(db, p.id)).toBeNull();
    expect(await listTouchesFor(db, p.id)).toEqual([]);
    expect(await listTasksFor(db, p.id)).toEqual([]);
    expect(await tagsForPerson(db, p.id)).toEqual([]);
  });
});
