/**
 * CSV + photo export.
 *
 * Pure functions only — the actual `URL.createObjectURL` lives in the
 * UI layer. We just produce the bytes here so the helper is testable.
 */
import type { Entry } from './store.ts';

/**
 * Quote a CSV field. Always quotes — costs a few bytes, makes the
 * output bullet-proof against commas, quotes, newlines.
 */
function csvField(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '""';
  const s = String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Build a CSV (RFC 4180) of all entries. Sorted oldest → newest so
 * a copy/paste into a spreadsheet line-charts immediately. Excludes
 * `photoLocalId` — a photo bytes export is a separate path.
 */
export function entriesToCsv(entries: readonly Entry[]): string {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const header = ['date', 'weight_kg', 'body_fat_pct', 'body_fat_method', 'note'].join(',');
  const rows = sorted.map((e) =>
    [
      csvField(e.date),
      csvField(e.weightKg.toFixed(2)),
      csvField(e.bodyFatPct?.toFixed(1) ?? ''),
      csvField(e.bodyFatMethod ?? ''),
      csvField(e.note ?? ''),
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

/**
 * Suggest a download filename for a CSV export.
 */
export function csvFilename(now: Date = new Date()): string {
  return `body-metrics-${now.toISOString().slice(0, 10)}.csv`;
}

/**
 * Suggest a download filename for a single photo, derived from the
 * entry date so the user's camera roll lines up chronologically.
 */
export function photoFilename(date: string, mime: string): string {
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  return `body-photo-${date}.${ext}`;
}
