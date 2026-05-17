import { describe, expect, it } from 'bun:test';
import { MemoryLocalDb } from './runtime.ts';
import {
  createCheckin,
  createNote,
  createPrepList,
  getNote,
  getLatestPrepList,
  listCheckins,
  listCheckinsSince,
  listNotes,
  listNotesInRange,
  localDateString,
  updatePrepList,
} from './queries.ts';

describe('therapy-notes queries', () => {
  describe('notes', () => {
    it('inserts and retrieves a free note', async () => {
      const db = new MemoryLocalDb();
      const created = await createNote(db, {
        kind: 'free',
        title: 'A bad day',
        body_md: 'Couldn\'t sleep. Felt small.',
      });
      const back = await getNote(db, created.id);
      expect(back?.body_md).toBe('Couldn\'t sleep. Felt small.');
      expect(back?.kind).toBe('free');
      expect(back?.title).toBe('A bad day');
    });

    it('lists notes newest-first', async () => {
      const db = new MemoryLocalDb();
      const a = await createNote(db, { kind: 'free', body_md: 'first' });
      await new Promise((r) => setTimeout(r, 4));
      const b = await createNote(db, { kind: 'free', body_md: 'second' });
      const list = await listNotes(db);
      expect(list[0]!.id).toBe(b.id);
      expect(list[1]!.id).toBe(a.id);
    });

    it('listNotesInRange filters by occurred_at', async () => {
      const db = new MemoryLocalDb();
      const longAgo = new Date('2026-01-01T10:00:00Z').toISOString();
      const recent = new Date('2026-04-30T10:00:00Z').toISOString();
      await createNote(db, { kind: 'free', body_md: 'old', occurred_at: longAgo });
      await createNote(db, { kind: 'free', body_md: 'new', occurred_at: recent });
      const inApril = await listNotesInRange(
        db,
        '2026-04-01T00:00:00Z',
        '2026-05-01T00:00:00Z',
      );
      expect(inApril).toHaveLength(1);
      expect(inApril[0]!.body_md).toBe('new');
    });

    it('preserves arbitrary worksheet kinds', async () => {
      const db = new MemoryLocalDb();
      await createNote(db, {
        kind: 'thought-record',
        title: 'Thought record',
        body_md: '## Thought record\n\n**Situation**\nMeeting.',
      });
      await createNote(db, {
        kind: 'values',
        body_md: '## Values check-in',
      });
      const all = await listNotes(db);
      const kinds = all.map((n) => n.kind).sort();
      expect(kinds).toEqual(['thought-record', 'values']);
    });
  });

  describe('checkins', () => {
    it('inserts and lists by occurred_on', async () => {
      const db = new MemoryLocalDb();
      await createCheckin(db, {
        occurred_on: '2026-04-28',
        mood_1to5: 3,
        anxiety_1to5: 4,
        sleep_hours: 6.5,
        note: 'tired',
      });
      await createCheckin(db, {
        occurred_on: '2026-04-29',
        mood_1to5: 4,
      });
      const list = await listCheckins(db);
      expect(list[0]!.occurred_on).toBe('2026-04-29');
      expect(list[1]!.note).toBe('tired');
    });

    it('lets a check-in save with only one field filled', async () => {
      const db = new MemoryLocalDb();
      const c = await createCheckin(db, { mood_1to5: 2 });
      expect(c.anxiety_1to5).toBeNull();
      expect(c.sleep_hours).toBeNull();
      expect(c.note).toBeNull();
      expect(c.mood_1to5).toBe(2);
    });

    it('listCheckinsSince filters by date string', async () => {
      const db = new MemoryLocalDb();
      await createCheckin(db, { occurred_on: '2026-04-20', mood_1to5: 3 });
      await createCheckin(db, { occurred_on: '2026-04-30', mood_1to5: 4 });
      const since = await listCheckinsSince(db, '2026-04-25');
      expect(since).toHaveLength(1);
      expect(since[0]!.occurred_on).toBe('2026-04-30');
    });

    it('localDateString produces YYYY-MM-DD', () => {
      const d = new Date(2026, 3, 5); // local midnight
      expect(localDateString(d)).toBe('2026-04-05');
    });
  });

  describe('prep_lists', () => {
    it('creates and updates the latest prep list', async () => {
      const db = new MemoryLocalDb();
      const created = await createPrepList(db, {
        label: 'Tuesday',
        body_md: '- Talk about Monday meeting',
      });
      const latest = await getLatestPrepList(db);
      expect(latest?.id).toBe(created.id);
      expect(latest?.body_md).toBe('- Talk about Monday meeting');

      await updatePrepList(db, created.id, {
        body_md: '- Talk about Monday meeting\n- And the call afterwards',
      });
      const after = await getLatestPrepList(db);
      expect(after?.body_md).toContain('And the call afterwards');
    });
  });
});
