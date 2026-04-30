/**
 * How Well Do You Know Me — author writes a question, the true answer,
 * and 2-3 plausible distractors. Partner picks one. Score is tracked
 * across rounds.
 *
 * Y.Array of rounds. Each round:
 *   id              string
 *   author_device   string
 *   question        string
 *   options         string[]   — true answer + distractors, shuffled at write
 *   correct_index   number     — index in `options` of the true answer
 *   guesses         Record<deviceId, number>
 *   created_at      ISO
 */
import * as Y from 'yjs';

export interface HwdkmRound {
  id: string;
  author_device: string;
  question: string;
  options: string[];
  correct_index: number;
  guesses: Record<string, number>;
  created_at: string;
}

function getArr(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray<Y.Map<unknown>>('hwdkm_rounds');
}

function readMap(m: Y.Map<unknown>): HwdkmRound {
  return {
    id: (m.get('id') as string | undefined) ?? '',
    author_device: (m.get('author_device') as string | undefined) ?? '',
    question: (m.get('question') as string | undefined) ?? '',
    options: (m.get('options') as string[] | undefined) ?? [],
    correct_index: (m.get('correct_index') as number | undefined) ?? 0,
    guesses: (m.get('guesses') as Record<string, number> | undefined) ?? {},
    created_at: (m.get('created_at') as string | undefined) ?? new Date().toISOString(),
  };
}

export function readHwdkmRounds(doc: Y.Doc): HwdkmRound[] {
  return getArr(doc).toArray().map(readMap).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function addHwdkmRound(
  doc: Y.Doc,
  authorDevice: string,
  question: string,
  trueAnswer: string,
  distractors: string[],
): HwdkmRound {
  const id = uuid();
  const all = [trueAnswer, ...distractors.filter((d) => d.trim().length > 0)];
  // Shuffle
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  const correctIndex = all.indexOf(trueAnswer);
  const m = new Y.Map<unknown>();
  doc.transact(() => {
    m.set('id', id);
    m.set('author_device', authorDevice);
    m.set('question', question);
    m.set('options', all);
    m.set('correct_index', correctIndex);
    m.set('guesses', {});
    m.set('created_at', new Date().toISOString());
    getArr(doc).push([m]);
  });
  return readMap(m);
}

export function guessHwdkm(
  doc: Y.Doc,
  roundId: string,
  deviceId: string,
  optionIndex: number,
): void {
  const arr = getArr(doc);
  for (let i = 0; i < arr.length; i++) {
    const m = arr.get(i)!;
    if (m.get('id') !== roundId) continue;
    const existing = (m.get('guesses') as Record<string, number> | undefined) ?? {};
    if (existing[deviceId] !== undefined) return; // no double-guess
    m.set('guesses', { ...existing, [deviceId]: optionIndex });
    return;
  }
}

export function deleteHwdkmRound(doc: Y.Doc, id: string): void {
  const arr = getArr(doc);
  for (let i = 0; i < arr.length; i++) {
    if (arr.get(i)!.get('id') === id) {
      arr.delete(i, 1);
      return;
    }
  }
}

export function hwdkmStreak(rounds: HwdkmRound[], guesserDevice: string): { right: number; wrong: number } {
  let right = 0;
  let wrong = 0;
  for (const r of rounds) {
    if (r.author_device === guesserDevice) continue;
    const g = r.guesses[guesserDevice];
    if (g === undefined) continue;
    if (g === r.correct_index) right += 1;
    else wrong += 1;
  }
  return { right, wrong };
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
