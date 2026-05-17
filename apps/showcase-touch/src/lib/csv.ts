/**
 * CSV export — separate shapes for people and touches.
 *
 * No dependencies. RFC-4180-ish quoting: any field containing a comma,
 * quote, CR, or LF gets wrapped in double quotes; embedded quotes are
 * doubled. Newline = "\r\n" so Windows Excel doesn't complain.
 *
 * Round-trip: parse(serialise(rows)) returns the same row list with all
 * values as strings. We don't try to coerce types back — the human is
 * pulling this for backup or for handing to a spreadsheet, not for
 * round-tripping into the same DB.
 */
import type { Person, Sentiment, Touch, TouchKind } from '../db/schema.ts';

const NEWLINE = '\r\n';

export const PEOPLE_COLUMNS = [
  'id',
  'name',
  'role',
  'company',
  'email',
  'phone',
  'notes_md',
  'cadence_days',
  'last_touch_at',
  'next_touch_at',
  'archived',
  'created_at',
] as const;

export const TOUCHES_COLUMNS = [
  'id',
  'person_id',
  'kind',
  'happened_at',
  'summary',
  'link_url',
  'sentiment',
] as const;

function escapeField(value: unknown): string {
  if (value == null) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function serialiseRows(
  columns: ReadonlyArray<string>,
  rows: ReadonlyArray<Record<string, unknown>>,
): string {
  const lines: string[] = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeField(row[c])).join(','));
  }
  return lines.join(NEWLINE) + NEWLINE;
}

export function serialisePeople(people: ReadonlyArray<Person>): string {
  return serialiseRows(PEOPLE_COLUMNS, people as unknown as ReadonlyArray<Record<string, unknown>>);
}

export function serialiseTouches(touches: ReadonlyArray<Touch>): string {
  return serialiseRows(TOUCHES_COLUMNS, touches as unknown as ReadonlyArray<Record<string, unknown>>);
}

/**
 * Tiny CSV parser. Handles quoted fields with embedded commas, doubled
 * quotes, and CRLF or LF terminators. Trailing newline is tolerated.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\r') {
      // peek for LF
      if (text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  // Trailing field if file didn't end with a newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop final empty row produced by trailing newline
  if (rows.length > 0) {
    const last = rows[rows.length - 1]!;
    if (last.length === 1 && last[0] === '') rows.pop();
  }
  return rows;
}

export function parseRows(
  text: string,
  columns: ReadonlyArray<string>,
): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length <= 1) return [];
  const out: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as string[];
    const obj: Record<string, string> = {};
    columns.forEach((c, j) => {
      obj[c] = r[j] ?? '';
    });
    out.push(obj);
  }
  return out;
}

export function parsePeople(text: string): Record<string, string>[] {
  return parseRows(text, PEOPLE_COLUMNS);
}

export function parseTouches(text: string): Record<string, string>[] {
  return parseRows(text, TOUCHES_COLUMNS);
}

/**
 * Convenience wrappers for the UI: produce a Blob suitable for an
 * <a download> link.
 */
export function peopleBlob(people: ReadonlyArray<Person>): Blob {
  return new Blob([serialisePeople(people)], { type: 'text/csv;charset=utf-8' });
}

export function touchesBlob(touches: ReadonlyArray<Touch>): Blob {
  return new Blob([serialiseTouches(touches)], { type: 'text/csv;charset=utf-8' });
}

export type { Sentiment, TouchKind };
