/**
 * CSV export of pitch metadata. Body content stays out — the user is
 * exporting a list of *what they pitched, to whom, when*, not the
 * pitches themselves. (Body export goes through Print → PDF.)
 *
 * Why metadata-only: a pitch CSV in someone's email or Drive is a
 * tracker. The drafts shouldn't be tagging along.
 */

import type { Pitch } from './store.ts';
import { PITCH_TYPE_LABEL } from './templates.ts';

const HEADERS = [
  'id',
  'type',
  'title',
  'target',
  'deadline',
  'status',
  'created_at',
  'updated_at',
];

function escapeCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function pitchesToCsv(pitches: Pitch[]): string {
  const rows: string[] = [HEADERS.join(',')];
  for (const p of pitches) {
    rows.push(
      [
        p.id,
        PITCH_TYPE_LABEL[p.type] ?? p.type,
        p.title,
        p.target ?? '',
        p.deadline ?? '',
        p.status,
        p.created_at,
        p.updated_at,
      ]
        .map(escapeCell)
        .join(','),
    );
  }
  return rows.join('\n');
}
