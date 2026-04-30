/**
 * Two Truths, One Lie state. Y.Array of rounds.
 *
 * Round shape:
 *   id              string
 *   author_device   string
 *   statements      [string, string, string]
 *   lie_index       0 | 1 | 2     — known to author, hidden from guesser
 *   guesses         Record<deviceId, 0 | 1 | 2>
 *   created_at      ISO
 *   revealed_at     string | null  — when the author chooses to unveil
 */
import * as Y from 'yjs';

export type Idx = 0 | 1 | 2;

export interface TtolRound {
  id: string;
  author_device: string;
  statements: [string, string, string];
  lie_index: Idx;
  guesses: Record<string, Idx>;
  created_at: string;
  revealed_at: string | null;
}

function getArr(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray<Y.Map<unknown>>('ttol_rounds');
}

export function readRounds(doc: Y.Doc): TtolRound[] {
  return getArr(doc)
    .toArray()
    .map(readMap)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function readMap(m: Y.Map<unknown>): TtolRound {
  const stmts = (m.get('statements') as string[] | undefined) ?? ['', '', ''];
  return {
    id: (m.get('id') as string | undefined) ?? '',
    author_device: (m.get('author_device') as string | undefined) ?? '',
    statements: [stmts[0] ?? '', stmts[1] ?? '', stmts[2] ?? ''] as [string, string, string],
    lie_index: ((m.get('lie_index') as Idx | undefined) ?? 0) as Idx,
    guesses: (m.get('guesses') as Record<string, Idx> | undefined) ?? {},
    created_at: (m.get('created_at') as string | undefined) ?? new Date().toISOString(),
    revealed_at: (m.get('revealed_at') as string | null | undefined) ?? null,
  };
}

export function addRound(
  doc: Y.Doc,
  authorDevice: string,
  statements: [string, string, string],
  lieIndex: Idx,
): TtolRound {
  const id = uuid();
  const m = new Y.Map<unknown>();
  doc.transact(() => {
    m.set('id', id);
    m.set('author_device', authorDevice);
    m.set('statements', statements);
    m.set('lie_index', lieIndex);
    m.set('guesses', {});
    m.set('created_at', new Date().toISOString());
    m.set('revealed_at', null);
    getArr(doc).push([m]);
  });
  return readMap(m);
}

export function guess(doc: Y.Doc, roundId: string, deviceId: string, idx: Idx): void {
  const arr = getArr(doc);
  for (let i = 0; i < arr.length; i++) {
    const m = arr.get(i)!;
    if (m.get('id') !== roundId) continue;
    const existing = (m.get('guesses') as Record<string, Idx> | undefined) ?? {};
    m.set('guesses', { ...existing, [deviceId]: idx });
    return;
  }
}

export function reveal(doc: Y.Doc, roundId: string): void {
  const arr = getArr(doc);
  for (let i = 0; i < arr.length; i++) {
    const m = arr.get(i)!;
    if (m.get('id') !== roundId) continue;
    if (!m.get('revealed_at')) m.set('revealed_at', new Date().toISOString());
    return;
  }
}

export function deleteRound(doc: Y.Doc, roundId: string): void {
  const arr = getArr(doc);
  for (let i = 0; i < arr.length; i++) {
    if (arr.get(i)!.get('id') === roundId) {
      arr.delete(i, 1);
      return;
    }
  }
}

export function streakOf(rounds: TtolRound[], guesserDevice: string): { wins: number; losses: number } {
  let wins = 0;
  let losses = 0;
  for (const r of rounds) {
    if (r.author_device === guesserDevice) continue;
    if (!r.revealed_at) continue;
    const g = r.guesses[guesserDevice];
    if (g === undefined) continue;
    if (g === r.lie_index) wins += 1;
    else losses += 1;
  }
  return { wins, losses };
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
