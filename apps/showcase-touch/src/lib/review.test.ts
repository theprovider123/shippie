import { describe, expect, test } from 'bun:test';
import type { Person, Task, Touch } from '../db/schema.ts';
import {
  POSITIVE_RECENT_DAYS,
  QUIET_THRESHOLD_DAYS,
  synthesise,
} from './review.ts';

const NOW = new Date('2026-05-05T12:00:00Z');

function isoDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function person(id: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
    name: id.toUpperCase(),
    role: null,
    company: null,
    email: null,
    phone: null,
    notes_md: null,
    cadence_days: 60,
    last_touch_at: null,
    next_touch_at: null,
    photo_url: null,
    archived: 0,
    created_at: NOW.toISOString(),
    ...overrides,
  };
}

function touch(id: string, person_id: string, daysAgo: number, overrides: Partial<Touch> = {}): Touch {
  return {
    id,
    person_id,
    kind: 'note',
    happened_at: isoDaysAgo(daysAgo),
    summary: '',
    link_url: null,
    sentiment: '0',
    ...overrides,
  };
}

describe('review · gone-quiet detection', () => {
  test('person with no touches is in gone-quiet', () => {
    const r = synthesise({
      people: [person('a')],
      touches: [],
      tasks: [],
      now: NOW,
    });
    expect(r.goneQuiet).toHaveLength(1);
    expect(r.goneQuiet[0]?.person.id).toBe('a');
    expect(r.goneQuiet[0]?.daysSinceLastTouch).toBeNull();
  });

  test('person touched > QUIET_THRESHOLD_DAYS ago is gone-quiet', () => {
    const r = synthesise({
      people: [person('a')],
      touches: [touch('t1', 'a', QUIET_THRESHOLD_DAYS + 5)],
      tasks: [],
      now: NOW,
    });
    expect(r.goneQuiet).toHaveLength(1);
    expect(r.goneQuiet[0]?.daysSinceLastTouch).toBe(QUIET_THRESHOLD_DAYS + 5);
  });

  test('person touched recently is NOT in gone-quiet', () => {
    const r = synthesise({
      people: [person('a')],
      touches: [touch('t1', 'a', 3)],
      tasks: [],
      now: NOW,
    });
    expect(r.goneQuiet).toHaveLength(0);
  });

  test('archived people are ignored', () => {
    const r = synthesise({
      people: [person('a', { archived: 1 })],
      touches: [],
      tasks: [],
      now: NOW,
    });
    expect(r.goneQuiet).toHaveLength(0);
  });

  test('gone-quiet sorts oldest-first (longest silence at top)', () => {
    const r = synthesise({
      people: [person('a'), person('b'), person('c')],
      touches: [
        touch('t1', 'a', 50),
        touch('t2', 'b', 100),
        // c has no touches
      ],
      tasks: [],
      now: NOW,
    });
    expect(r.goneQuiet.map((q) => q.person.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('review · positive recent', () => {
  test('positive sentiment within 14 days surfaces', () => {
    const r = synthesise({
      people: [person('a')],
      touches: [touch('t1', 'a', 4, { sentiment: '+', summary: 'great chat' })],
      tasks: [],
      now: NOW,
    });
    expect(r.positive).toHaveLength(1);
    expect(r.positive[0]?.lastSummary).toBe('great chat');
  });

  test('positive sentiment older than window is NOT surfaced', () => {
    const r = synthesise({
      people: [person('a')],
      touches: [touch('t1', 'a', POSITIVE_RECENT_DAYS + 5, { sentiment: '+' })],
      tasks: [],
      now: NOW,
    });
    expect(r.positive).toHaveLength(0);
  });

  test('neutral sentiment is NOT positive', () => {
    const r = synthesise({
      people: [person('a')],
      touches: [touch('t1', 'a', 3, { sentiment: '0' })],
      tasks: [],
      now: NOW,
    });
    expect(r.positive).toHaveLength(0);
  });

  test('a person can be in gone-quiet OR positive, never both', () => {
    const r = synthesise({
      people: [person('a')],
      touches: [
        touch('t-old', 'a', 60, { sentiment: '+' }),
        touch('t-recent', 'a', 5, { sentiment: '+' }),
      ],
      tasks: [],
      now: NOW,
    });
    expect(r.goneQuiet).toHaveLength(0);
    expect(r.positive).toHaveLength(1);
  });
});

describe('review · due actions', () => {
  function task(id: string, person_id: string, dueDaysFromNow: number, done = false): Task {
    return {
      id,
      person_id,
      body: `task ${id}`,
      due_at: new Date(NOW.getTime() + dueDaysFromNow * 86_400_000).toISOString(),
      done_at: done ? NOW.toISOString() : null,
      created_at: NOW.toISOString(),
    };
  }

  test('open tasks due today or past surface', () => {
    const r = synthesise({
      people: [person('a')],
      touches: [],
      tasks: [task('t1', 'a', -3), task('t2', 'a', 0), task('t3', 'a', 5)],
      now: NOW,
    });
    expect(r.dueActions.map((d) => d.task.id)).toEqual(['t1', 't2']);
  });

  test('done tasks never surface', () => {
    const r = synthesise({
      people: [person('a')],
      touches: [],
      tasks: [task('t1', 'a', -3, true)],
      now: NOW,
    });
    expect(r.dueActions).toHaveLength(0);
  });

  test('tasks resolve their person reference', () => {
    const r = synthesise({
      people: [person('a', { name: 'Ada' })],
      touches: [],
      tasks: [task('t1', 'a', -1)],
      now: NOW,
    });
    expect(r.dueActions[0]?.person?.name).toBe('Ada');
  });
});
