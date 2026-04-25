import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import {
  awardPointToWinner,
  createQuizState,
  firstBuzzerForQuestion,
  recordBuzz,
} from './quiz-state.ts';
import type { Score } from './types.ts';

describe('first-wins lockout', () => {
  test('returns null when no buzzes for the question', () => {
    const state = createQuizState();
    expect(firstBuzzerForQuestion(state, 0)).toBeNull();
  });

  test('returns the earliest-ts buzz', () => {
    const state = createQuizState();
    recordBuzz(state, { peerId: 'b', ts: 200, questionIndex: 0 });
    recordBuzz(state, { peerId: 'a', ts: 100, questionIndex: 0 });
    expect(firstBuzzerForQuestion(state, 0)?.peerId).toBe('a');
  });

  test('breaks ties by lowest peerId on equal ts', () => {
    const state = createQuizState();
    recordBuzz(state, { peerId: 'b', ts: 100, questionIndex: 0 });
    recordBuzz(state, { peerId: 'a', ts: 100, questionIndex: 0 });
    expect(firstBuzzerForQuestion(state, 0)?.peerId).toBe('a');
  });

  test('ignores buzzes for other questions', () => {
    const state = createQuizState();
    recordBuzz(state, { peerId: 'a', ts: 100, questionIndex: 1 });
    expect(firstBuzzerForQuestion(state, 0)).toBeNull();
  });
});

describe('scoring', () => {
  test('adds 1 point to the winner', () => {
    const state = createQuizState();
    recordBuzz(state, { peerId: 'a', ts: 100, questionIndex: 0 });
    awardPointToWinner(state, 0);
    const scores = state.getArray('scores').toArray() as Score[];
    expect(scores.find((s) => s.peerId === 'a')?.points).toBe(1);
  });

  test('accumulates across questions', () => {
    const state = createQuizState();
    recordBuzz(state, { peerId: 'a', ts: 100, questionIndex: 0 });
    awardPointToWinner(state, 0);
    recordBuzz(state, { peerId: 'a', ts: 100, questionIndex: 1 });
    awardPointToWinner(state, 1);
    const scores = state.getArray('scores').toArray() as Score[];
    expect(scores.find((s) => s.peerId === 'a')?.points).toBe(2);
  });

  test('is a no-op if no buzzer for that question', () => {
    const state = createQuizState();
    awardPointToWinner(state, 0);
    expect((state.getArray('scores').toArray() as unknown[]).length).toBe(0);
  });
});

describe('CRDT convergence', () => {
  test('two docs converge to the same first-buzzer after sync', () => {
    const a = createQuizState();
    const b = createQuizState();
    recordBuzz(a, { peerId: 'a', ts: 100, questionIndex: 0 });
    recordBuzz(b, { peerId: 'b', ts: 100, questionIndex: 0 });

    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));

    expect(firstBuzzerForQuestion(a, 0)?.peerId).toBe(firstBuzzerForQuestion(b, 0)?.peerId);
    expect(firstBuzzerForQuestion(a, 0)?.peerId).toBe('a');
  });
});
