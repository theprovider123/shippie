/**
 * Word-bank loader + bank-version metadata.
 *
 * Each puzzle id is `fl-YYYY-MM-DD-<lang>-<bankVersion>`. The bank
 * version is part of every emitted observation and stored with each
 * persisted answer so a future bank refresh doesn't rewrite history.
 *
 * Loading: word banks ship as `/<base>/words/<lang>.txt` plain-text
 * files (one word per line, lowercase, UTF-8). The runtime fetches
 * once per session and caches the parsed array.
 *
 * Daily-pick: deterministic from the date + language seed; same day
 * shows the same word on every device for that language.
 */

export const BANK_VERSION = 'v1';

export type Lang = 'en' | 'es' | 'fr';
export const LANGS: ReadonlyArray<{ code: Lang; label: string; flag: string }> = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
];

export interface DailyPuzzle {
  puzzle_id: string;     // fl-YYYY-MM-DD-<lang>-v1
  date: string;          // YYYY-MM-DD
  lang: Lang;
  answer: string;        // lowercase
}

const cache: Partial<Record<Lang, string[]>> = {};

export async function loadWords(lang: Lang): Promise<string[]> {
  if (cache[lang]) return cache[lang]!;
  const res = await fetch(`./words/${lang}.txt`);
  if (!res.ok) throw new Error(`words/${lang}.txt fetch failed: ${res.status}`);
  const text = await res.text();
  const words = text
    .split(/\r?\n/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length === 5 && /^[a-zà-ÿ]+$/u.test(w));
  cache[lang] = words;
  return words;
}

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

export function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function puzzleForDate(date: string, lang: Lang, words: string[]): DailyPuzzle {
  const seed = djb2(`fl-${date}-${lang}-${BANK_VERSION}`);
  const idx = words.length === 0 ? 0 : seed % words.length;
  const answer = words[idx] ?? 'about';
  return {
    puzzle_id: `fl-${date}-${lang}-${BANK_VERSION}`,
    date,
    lang,
    answer,
  };
}

export function randomPuzzle(lang: Lang, words: string[]): DailyPuzzle {
  const idx = Math.floor(Math.random() * Math.max(1, words.length));
  const answer = words[idx] ?? 'about';
  // Practice-mode puzzles use the millisecond timestamp as the unique
  // suffix so re-saves of the same date+lang aren't conflated with the
  // daily entry.
  return {
    puzzle_id: `fl-practice-${Date.now()}-${lang}`,
    date: todayKey(),
    lang,
    answer,
  };
}

/** Score one guess against the answer; returns per-tile state. */
export type TileState = 'correct' | 'present' | 'absent';
export function scoreGuess(answer: string, guess: string): TileState[] {
  const n = answer.length;
  const result: TileState[] = new Array(n).fill('absent');
  // First pass: greens. Track remaining answer letters (count) so we
  // don't double-credit yellows on duplicate-letter guesses.
  const remaining: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    if (guess[i] === answer[i]) result[i] = 'correct';
    else remaining[answer[i]!] = (remaining[answer[i]!] ?? 0) + 1;
  }
  // Second pass: yellows.
  for (let i = 0; i < n; i++) {
    if (result[i] !== 'absent') continue;
    const ch = guess[i]!;
    if ((remaining[ch] ?? 0) > 0) {
      result[i] = 'present';
      remaining[ch] = (remaining[ch] ?? 0) - 1;
    }
  }
  return result;
}

export function shareGrid(states: TileState[][], puzzleId: string): string {
  const rows = states.map((row) =>
    row.map((s) => (s === 'correct' ? '🟩' : s === 'present' ? '🟨' : '⬜')).join(''),
  );
  return [
    `Five Letter ${puzzleId} — ${states.length}/6`,
    ...rows,
    'shippie.app/run/five-letter/',
  ].join('\n');
}
