import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import {
  awardPointToWinner,
  createQuizState,
  firstBuzzerForQuestion,
  recordBuzz,
} from './shared/quiz-state.ts';
import { next, reveal, startQuiz } from './host/quiz-controller.ts';

function sync(...docs: Y.Doc[]) {
  for (const a of docs) {
    for (const b of docs) {
      if (a === b) continue;
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    }
  }
}

describe('two-peer convergence', () => {
  test('host advances quiz; guest sees same phase + question', () => {
    const host = createQuizState();
    const guest = createQuizState();
    startQuiz(host);
    sync(host, guest);
    expect(guest.getMap('meta').get('phase')).toBe('question');
    expect(guest.getMap('meta').get('currentIndex')).toBe(0);
  });

  test('two guests buzz; deterministic winner across all peers', () => {
    const host = createQuizState();
    const g1 = createQuizState();
    const g2 = createQuizState();
    startQuiz(host);
    sync(host, g1, g2);

    recordBuzz(g1, { peerId: 'g1', ts: 100, questionIndex: 0 });
    recordBuzz(g2, { peerId: 'g2', ts: 100, questionIndex: 0 });
    sync(host, g1, g2);

    expect(firstBuzzerForQuestion(host, 0)?.peerId).toBe('g1');
    expect(firstBuzzerForQuestion(g1, 0)?.peerId).toBe('g1');
    expect(firstBuzzerForQuestion(g2, 0)?.peerId).toBe('g1');
  });

  test('host awards point; all peers see updated score', () => {
    const host = createQuizState();
    const guest = createQuizState();
    startQuiz(host);
    recordBuzz(host, { peerId: 'g1', ts: 100, questionIndex: 0 });
    sync(host, guest);
    awardPointToWinner(host, 0);
    sync(host, guest);
    const guestScores = guest.getArray('scores').toArray() as Array<{
      peerId: string;
      points: number;
    }>;
    expect(guestScores).toEqual([{ peerId: 'g1', points: 1 }]);
  });

  test('full game flow ends in finished phase', () => {
    const host = createQuizState();
    startQuiz(host);
    for (let i = 0; i < 3; i++) {
      recordBuzz(host, { peerId: 'g1', ts: 100 + i, questionIndex: i });
      reveal(host);
      next(host);
    }
    expect(host.getMap('meta').get('phase')).toBe('finished');
    const scores = host.getArray('scores').toArray() as Array<{
      peerId: string;
      points: number;
    }>;
    expect(scores.find((s) => s.peerId === 'g1')?.points).toBe(3);
  });
});
