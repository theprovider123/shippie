/**
 * Local persistence — pure functions over the row list. The component
 * wraps these in useState so React re-renders, but tests can call
 * directly without a DOM.
 */
import { storageKeyFor, type LoggedRow } from './types.ts';

export function loadRows(slug: string, storage: Storage = localStorage): LoggedRow[] {
  try {
    const raw = storage.getItem(storageKeyFor(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LoggedRow[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is LoggedRow =>
        Boolean(r) &&
        typeof r === 'object' &&
        typeof r.id === 'string' &&
        typeof r.loggedAt === 'number' &&
        Number.isFinite(r.loggedAt) &&
        typeof r.fields === 'object',
    );
  } catch {
    return [];
  }
}

export function saveRows(slug: string, rows: readonly LoggedRow[], storage: Storage = localStorage): void {
  try {
    storage.setItem(storageKeyFor(slug), JSON.stringify(rows));
  } catch {
    /* quota errors non-fatal — the app keeps the in-memory copy */
  }
}

export function appendRow(
  rows: readonly LoggedRow[],
  fields: Record<string, unknown>,
  defaults: Record<string, unknown> | undefined,
  now: number = Date.now(),
): { rows: LoggedRow[]; row: LoggedRow } {
  const row: LoggedRow = {
    id: `r_${now}_${Math.floor(Math.random() * 1e6)}`,
    loggedAt: now,
    fields: { ...(defaults ?? {}), ...fields },
  };
  return { rows: [row, ...rows], row };
}
