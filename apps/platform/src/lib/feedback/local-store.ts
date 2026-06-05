/**
 * On-device record of feedback this browser submitted (Slice C).
 *
 * Lets a user — even without an account — see what they sent and (via the
 * capability read endpoint, keyed by the stored ids) the current status + maker
 * reply. Mirrors the launcher-memory storage guards: best-effort, never throws.
 */
const KEY = 'shippie:feedback:local:v1';
const MAX_ENTRIES = 50;

export type LocalFeedbackEntry = {
  id: string;
  appSlug: string;
  type: string;
  message: string;
  createdAt: string;
};

function isEntry(value: unknown): value is LocalFeedbackEntry {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as LocalFeedbackEntry).id === 'string' &&
    typeof (value as LocalFeedbackEntry).appSlug === 'string'
  );
}

/** Dedupe by id, newest first, capped. Pure — the testable core. */
export function mergeLocalEntry(
  list: LocalFeedbackEntry[],
  entry: LocalFeedbackEntry,
  max = MAX_ENTRIES,
): LocalFeedbackEntry[] {
  const without = list.filter((e) => e.id !== entry.id);
  return [entry, ...without].slice(0, max);
}

function readRaw(): LocalFeedbackEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export function readLocalFeedback(): LocalFeedbackEntry[] {
  return readRaw();
}

export function recordLocalFeedback(entry: LocalFeedbackEntry): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(mergeLocalEntry(readRaw(), entry)));
  } catch {
    // storage blocked/quota — fine, the row still lives server-side
  }
}

export function localFeedbackIds(): string[] {
  return readRaw().map((e) => e.id);
}
