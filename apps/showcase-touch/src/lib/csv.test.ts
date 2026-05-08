import { describe, expect, test } from 'bun:test';
import type { Person, Touch } from '../db/schema.ts';
import {
  PEOPLE_COLUMNS,
  TOUCHES_COLUMNS,
  parseCsv,
  parsePeople,
  parseTouches,
  serialisePeople,
  serialiseTouches,
} from './csv.ts';

const PERSON: Person = {
  id: 'p_1',
  name: 'Ada, Lovelace',
  role: 'CTO',
  company: 'Acme "Industries"',
  email: 'ada@example.com',
  phone: null,
  notes_md: 'Likes\r\nCobol.',
  cadence_days: 30,
  last_touch_at: '2026-04-01T00:00:00.000Z',
  next_touch_at: '2026-05-01T00:00:00.000Z',
  photo_url: null,
  archived: 0,
  created_at: '2026-01-01T00:00:00.000Z',
};

const TOUCH: Touch = {
  id: 't_1',
  person_id: 'p_1',
  kind: 'coffee',
  happened_at: '2026-04-01T00:00:00.000Z',
  summary: 'King\'s Head, talked roadmap, "very honest"',
  link_url: null,
  sentiment: '+',
};

describe('csv · serialise', () => {
  test('header row matches column order', () => {
    const csv = serialisePeople([]);
    const [header] = csv.split('\r\n');
    expect(header).toBe(PEOPLE_COLUMNS.join(','));
  });

  test('quotes commas, double-quotes, and newlines', () => {
    const csv = serialisePeople([PERSON]);
    // name "Ada, Lovelace" should be wrapped
    expect(csv).toContain('"Ada, Lovelace"');
    // company has a quote → "Acme ""Industries"""
    expect(csv).toContain('"Acme ""Industries"""');
    // notes contains CR/LF → field is wrapped
    expect(csv).toContain('"Likes\r\nCobol."');
  });

  test('null and undefined render as empty', () => {
    const csv = serialisePeople([
      { ...PERSON, phone: null, photo_url: null },
    ]);
    // Find the phone column (index in PEOPLE_COLUMNS) and assert empty
    const headerLine = csv.split('\r\n')[0]!;
    const phoneIdx = headerLine.split(',').indexOf('phone');
    const dataLine = csv.split('\r\n')[1]!;
    const fields = parseCsv(csv)[1] as string[];
    expect(fields[phoneIdx]).toBe('');
  });
});

describe('csv · round-trip', () => {
  test('people round-trip preserves textual content', () => {
    const csv = serialisePeople([PERSON]);
    const parsed = parsePeople(csv);
    expect(parsed).toHaveLength(1);
    const r = parsed[0]!;
    expect(r.name).toBe('Ada, Lovelace');
    expect(r.company).toBe('Acme "Industries"');
    expect(r.notes_md).toBe('Likes\r\nCobol.');
    expect(r.cadence_days).toBe('30');
    expect(r.archived).toBe('0');
  });

  test('touches round-trip preserves textual content', () => {
    const csv = serialiseTouches([TOUCH]);
    const parsed = parseTouches(csv);
    expect(parsed).toHaveLength(1);
    const r = parsed[0]!;
    expect(r.kind).toBe('coffee');
    expect(r.sentiment).toBe('+');
    expect(r.summary).toBe('King\'s Head, talked roadmap, "very honest"');
  });

  test('empty input produces just a header', () => {
    const csv = serialisePeople([]);
    expect(csv).toBe(PEOPLE_COLUMNS.join(',') + '\r\n');
    expect(parsePeople(csv)).toEqual([]);
  });

  test('parses LF-only line endings (non-Windows files)', () => {
    const csv = `${TOUCHES_COLUMNS.join(',')}\nt_1,p_1,note,2026-04-01T00:00:00.000Z,hello,,0\n`;
    const parsed = parseTouches(csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.summary).toBe('hello');
  });
});
