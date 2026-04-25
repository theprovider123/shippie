/**
 * Quiz state as a Yjs document. Three shared structures:
 *   - 'meta' Y.Map         currentIndex, phase
 *   - 'buzzes' Y.Array     append-only Buzz log (one entry per peer per question)
 *   - 'scores' Y.Array     shared Score table (mutated by host on award)
 *
 * First-buzzer-wins is computed from the buzz log on read, never persisted
 * as a separate "winner" field — keeping the source of truth in one place
 * removes a class of inconsistency bugs across peers.
 */
import * as Y from 'yjs';
import type { Buzz, Phase, Score } from './types.ts';

export function createQuizState(): Y.Doc {
  const doc = new Y.Doc();
  const meta = doc.getMap('meta');
  if (!meta.has('currentIndex')) meta.set('currentIndex', 0);
  if (!meta.has('phase')) meta.set('phase', 'lobby' satisfies Phase);
  return doc;
}

export function getMeta(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('meta');
}

export function getCurrentIndex(doc: Y.Doc): number {
  return (getMeta(doc).get('currentIndex') as number | undefined) ?? 0;
}

export function setCurrentIndex(doc: Y.Doc, index: number): void {
  getMeta(doc).set('currentIndex', index);
}

export function getPhase(doc: Y.Doc): Phase {
  return (getMeta(doc).get('phase') as Phase | undefined) ?? 'lobby';
}

export function setPhase(doc: Y.Doc, phase: Phase): void {
  getMeta(doc).set('phase', phase);
}

export function recordBuzz(doc: Y.Doc, buzz: Buzz): void {
  doc.getArray<Buzz>('buzzes').push([buzz]);
}

export function buzzesForQuestion(doc: Y.Doc, questionIndex: number): Buzz[] {
  return doc
    .getArray<Buzz>('buzzes')
    .toArray()
    .filter((b) => b.questionIndex === questionIndex);
}

export function firstBuzzerForQuestion(doc: Y.Doc, questionIndex: number): Buzz | null {
  const candidates = buzzesForQuestion(doc, questionIndex);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.ts - b.ts || a.peerId.localeCompare(b.peerId));
  return candidates[0]!;
}

export function awardPointToWinner(doc: Y.Doc, questionIndex: number): void {
  const winner = firstBuzzerForQuestion(doc, questionIndex);
  if (!winner) return;
  const scores = doc.getArray<Score>('scores');
  const list = scores.toArray();
  const existing = list.findIndex((s) => s.peerId === winner.peerId);
  if (existing >= 0) {
    const current = list[existing]!;
    scores.delete(existing, 1);
    scores.insert(existing, [{ peerId: current.peerId, points: current.points + 1 }]);
  } else {
    scores.push([{ peerId: winner.peerId, points: 1 }]);
  }
}
